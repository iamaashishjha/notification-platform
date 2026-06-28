package metrics

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type requestStat struct {
	mu     sync.Mutex
	counts map[string]int64 // key: "METHOD /pathGroup status"
}

type durationHist struct {
	mu     sync.Mutex
	buckets  [5]int64 // 0.1, 0.5, 1, 5, +Inf
	sum      float64
	count    int64
}

type WSStatsProvider interface {
	GetWSStats() (sent, acked, disconnects, syncs int64)
}

type Collector struct {
	db *pgxpool.Pool
	log *zap.Logger
	ws WSStatsProvider

	NotificationsSent       atomic.Int64
	NotificationsFailed     atomic.Int64
	NotificationsRetried    atomic.Int64
	NotificationsDeadLettered atomic.Int64
	CampaignsSent           atomic.Int64

	QueueJobsProcessed      atomic.Int64
	QueueJobsFailed         atomic.Int64

	// Req metrics (process-level)
	reqCount    requestStat
	reqDuration durationHist

	// WS metrics (process-level)
	WSConnectionsActive atomic.Int64
	WSMessagesSent      atomic.Int64
	WSMessagesAcked     atomic.Int64
	WSDisconnects       atomic.Int64
	WSReconnectSyncs    atomic.Int64

	// Panic counter
	PanicsTotal atomic.Int64

	// Provider metrics (DB-backed, refreshed)
	ProviderSendTotal   map[string]int64 // key: "provider:channel"
	ProviderSendFailed  map[string]int64
	providerMu          sync.Mutex

	// Worker metrics (DB-backed, refreshed)
	WorkerJobsStarted  atomic.Int64
	WorkerJobsCompleted atomic.Int64
	WorkerJobsFailed   atomic.Int64
	WorkerActive       atomic.Int64

	// Queue metrics (DB-backed, refreshed)
	QueuePublishTotal   atomic.Int64
	QueuePublishFailed  atomic.Int64
	QueueConsumeTotal   atomic.Int64
	RetryQueueTotal     atomic.Int64
	DeadLetterTotal     atomic.Int64
}

func New(db *pgxpool.Pool, log *zap.Logger, ws ...WSStatsProvider) *Collector {
	c := &Collector{
		db: db,
		log: log,
		reqCount: requestStat{counts: make(map[string]int64)},
		ProviderSendTotal:  make(map[string]int64),
		ProviderSendFailed: make(map[string]int64),
	}
	if len(ws) > 0 {
		c.ws = ws[0]
	}
	return c
}

func (c *Collector) Handler(w http.ResponseWriter, r *http.Request) {
	c.refresh(r.Context())

	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	w.WriteHeader(http.StatusOK)

	var buf strings.Builder

	// Notification counters
	buf.WriteString("# HELP notifications_sent_total Total notifications sent\n")
	buf.WriteString("# TYPE notifications_sent_total counter\n")
	fmt.Fprintf(&buf, "notifications_sent_total %d\n", c.NotificationsSent.Load())
	buf.WriteString("# HELP notifications_failed_total Total notifications failed\n")
	buf.WriteString("# TYPE notifications_failed_total counter\n")
	fmt.Fprintf(&buf, "notifications_failed_total %d\n", c.NotificationsFailed.Load())
	buf.WriteString("# HELP notifications_retried_total Total notifications retried\n")
	buf.WriteString("# TYPE notifications_retried_total counter\n")
	fmt.Fprintf(&buf, "notifications_retried_total %d\n", c.NotificationsRetried.Load())
	buf.WriteString("# HELP notifications_dead_lettered_total Total notifications dead-lettered\n")
	buf.WriteString("# TYPE notifications_dead_lettered_total counter\n")
	fmt.Fprintf(&buf, "notifications_dead_lettered_total %d\n", c.NotificationsDeadLettered.Load())

	// Campaign counter
	buf.WriteString("# HELP campaigns_sent_total Total campaigns sent\n")
	buf.WriteString("# TYPE campaigns_sent_total counter\n")
	fmt.Fprintf(&buf, "campaigns_sent_total %d\n", c.CampaignsSent.Load())

	// Queue counters
	buf.WriteString("# HELP queue_jobs_processed_total Total queue jobs processed\n")
	buf.WriteString("# TYPE queue_jobs_processed_total counter\n")
	fmt.Fprintf(&buf, "queue_jobs_processed_total %d\n", c.QueueJobsProcessed.Load())
	buf.WriteString("# HELP queue_jobs_failed_total Total queue jobs failed\n")
	buf.WriteString("# TYPE queue_jobs_failed_total counter\n")
	fmt.Fprintf(&buf, "queue_jobs_failed_total %d\n", c.QueueJobsFailed.Load())
	buf.WriteString("# HELP queue_publish_total Total queue messages published\n")
	buf.WriteString("# TYPE queue_publish_total counter\n")
	fmt.Fprintf(&buf, "queue_publish_total %d\n", c.QueuePublishTotal.Load())
	buf.WriteString("# HELP queue_publish_failed_total Total queue publish failures\n")
	buf.WriteString("# TYPE queue_publish_failed_total counter\n")
	fmt.Fprintf(&buf, "queue_publish_failed_total %d\n", c.QueuePublishFailed.Load())
	buf.WriteString("# HELP queue_consume_total Total queue messages consumed\n")
	buf.WriteString("# TYPE queue_consume_total counter\n")
	fmt.Fprintf(&buf, "queue_consume_total %d\n", c.QueueConsumeTotal.Load())
	buf.WriteString("# HELP retry_queue_total Total messages in retry queue\n")
	buf.WriteString("# TYPE retry_queue_total counter\n")
	fmt.Fprintf(&buf, "retry_queue_total %d\n", c.RetryQueueTotal.Load())
	buf.WriteString("# HELP dead_letter_total Total dead-lettered messages\n")
	buf.WriteString("# TYPE dead_letter_total counter\n")
	fmt.Fprintf(&buf, "dead_letter_total %d\n", c.DeadLetterTotal.Load())

	// Worker counters
	buf.WriteString("# HELP worker_jobs_started_total Total worker jobs started\n")
	buf.WriteString("# TYPE worker_jobs_started_total counter\n")
	fmt.Fprintf(&buf, "worker_jobs_started_total %d\n", c.WorkerJobsStarted.Load())
	buf.WriteString("# HELP worker_jobs_completed_total Total worker jobs completed\n")
	buf.WriteString("# TYPE worker_jobs_completed_total counter\n")
	fmt.Fprintf(&buf, "worker_jobs_completed_total %d\n", c.WorkerJobsCompleted.Load())
	buf.WriteString("# HELP worker_jobs_failed_total Total worker jobs failed\n")
	buf.WriteString("# TYPE worker_jobs_failed_total counter\n")
	fmt.Fprintf(&buf, "worker_jobs_failed_total %d\n", c.WorkerJobsFailed.Load())
	buf.WriteString("# HELP worker_active_gauge Currently active worker jobs\n")
	buf.WriteString("# TYPE worker_active_gauge gauge\n")
	fmt.Fprintf(&buf, "worker_active_gauge %d\n", c.WorkerActive.Load())

	// Provider counters (DB-backed)
	buf.WriteString("# HELP provider_send_total Total sends by provider\n")
	buf.WriteString("# TYPE provider_send_total counter\n")
	c.providerMu.Lock()
	for key, val := range c.ProviderSendTotal {
		fmt.Fprintf(&buf, "provider_send_total{provider_channel=\"%s\"} %d\n", key, val)
	}
	for key, val := range c.ProviderSendFailed {
		fmt.Fprintf(&buf, "provider_send_failed_total{provider_channel=\"%s\"} %d\n", key, val)
	}
	c.providerMu.Unlock()
	buf.WriteString("# HELP provider_send_failed_total Total send failures by provider\n")
	buf.WriteString("# TYPE provider_send_failed_total counter\n")

	// WebSocket metrics
	buf.WriteString("# HELP websocket_connections_active Current active WebSocket connections\n")
	buf.WriteString("# TYPE websocket_connections_active gauge\n")
	fmt.Fprintf(&buf, "websocket_connections_active %d\n", c.WSConnectionsActive.Load())
	buf.WriteString("# HELP websocket_messages_sent_total Total WebSocket messages sent\n")
	buf.WriteString("# TYPE websocket_messages_sent_total counter\n")
	fmt.Fprintf(&buf, "websocket_messages_sent_total %d\n", c.WSMessagesSent.Load())
	buf.WriteString("# HELP websocket_messages_acked_total Total WebSocket messages acked\n")
	buf.WriteString("# TYPE websocket_messages_acked_total counter\n")
	fmt.Fprintf(&buf, "websocket_messages_acked_total %d\n", c.WSMessagesAcked.Load())
	buf.WriteString("# HELP websocket_disconnects_total Total WebSocket disconnects\n")
	buf.WriteString("# TYPE websocket_disconnects_total counter\n")
	fmt.Fprintf(&buf, "websocket_disconnects_total %d\n", c.WSDisconnects.Load())
	buf.WriteString("# HELP websocket_reconnect_syncs_total Total reconnect syncs\n")
	buf.WriteString("# TYPE websocket_reconnect_syncs_total counter\n")
	fmt.Fprintf(&buf, "websocket_reconnect_syncs_total %d\n", c.WSReconnectSyncs.Load())

	// Panic counter
	buf.WriteString("# HELP panics_total Total panics recovered\n")
	buf.WriteString("# TYPE panics_total counter\n")
	fmt.Fprintf(&buf, "panics_total %d\n", c.PanicsTotal.Load())

	// Request duration histogram
	buf.WriteString("# HELP request_duration_seconds Request duration in seconds\n")
	buf.WriteString("# TYPE request_duration_seconds histogram\n")
	c.reqDuration.mu.Lock()
	buckets := []float64{0.1, 0.5, 1, 5}
	for i, b := range buckets {
		fmt.Fprintf(&buf, "request_duration_seconds_bucket{le=\"%g\"} %d\n", b, c.reqDuration.buckets[i])
	}
	fmt.Fprintf(&buf, "request_duration_seconds_bucket{le=\"+Inf\"} %d\n", c.reqDuration.buckets[4])
	fmt.Fprintf(&buf, "request_duration_seconds_sum %g\n", c.reqDuration.sum)
	fmt.Fprintf(&buf, "request_duration_seconds_count %d\n", c.reqDuration.count)
	c.reqDuration.mu.Unlock()

	// Worker duration histogram
	buf.WriteString("# HELP worker_duration_seconds Worker processing duration in seconds\n")
	buf.WriteString("# TYPE worker_duration_seconds histogram\n")
	for _, b := range buckets {
		fmt.Fprintf(&buf, "worker_duration_seconds_bucket{le=\"%g\"} 0\n", b)
	}
	buf.WriteString("worker_duration_seconds_bucket{le=\"+Inf\"} 0\n")
	buf.WriteString("worker_duration_seconds_sum 0\n")
	buf.WriteString("worker_duration_seconds_count 0\n")

	// Request count by method and status
	c.reqCount.mu.Lock()
	for key, val := range c.reqCount.counts {
		fmt.Fprintf(&buf, "http_requests_total{method=\"%s\"} %d\n", key, val)
	}
	c.reqCount.mu.Unlock()

	_, _ = fmt.Fprint(w, buf.String())
}

func (c *Collector) SetWSStatsProvider(ws WSStatsProvider) { c.ws = ws }

func (c *Collector) refresh(ctx context.Context) {
	if c.db == nil {
		return
	}
	var sent, failed, retried, deadLettered, campaignsSent int64
	_ = c.db.QueryRow(ctx, `SELECT COUNT(*) FROM notification_deliveries WHERE status = 'sent'`).Scan(&sent)
	_ = c.db.QueryRow(ctx, `SELECT COUNT(*) FROM notification_deliveries WHERE status = 'failed'`).Scan(&failed)
	_ = c.db.QueryRow(ctx, `SELECT COALESCE(SUM((response_json->>'retry_count')::int),0) FROM notification_deliveries WHERE response_json ? 'retry_count'`).Scan(&retried)
	_ = c.db.QueryRow(ctx, `SELECT COUNT(*) FROM notification_deliveries WHERE status = 'dead'`).Scan(&deadLettered)
	_ = c.db.QueryRow(ctx, `SELECT COUNT(*) FROM campaigns WHERE status = 'sent'`).Scan(&campaignsSent)
	c.NotificationsSent.Store(sent)
	c.NotificationsFailed.Store(failed)
	c.NotificationsRetried.Store(retried)
	c.NotificationsDeadLettered.Store(deadLettered)
	c.CampaignsSent.Store(campaignsSent)

	if c.ws != nil {
		sent, acked, disconnects, syncs := c.ws.GetWSStats()
		c.WSMessagesSent.Store(sent)
		c.WSMessagesAcked.Store(acked)
		c.WSDisconnects.Store(disconnects)
		c.WSReconnectSyncs.Store(syncs)
	}

	// Worker metrics from delivery_attempts
	rows, err := c.db.Query(ctx, `SELECT da.status, da.duration_ms FROM delivery_attempts da`)
	if err == nil {
		defer rows.Close()
		var started, completed, failedJobs int64
		for rows.Next() {
			var status string
			var dms *int64
			if err := rows.Scan(&status, &dms); err != nil {
				continue
			}
			started++
			if status == "sent" {
				completed++
			} else if status == "failed" {
				failedJobs++
			}
		}
		c.WorkerJobsStarted.Store(started)
		c.WorkerJobsCompleted.Store(completed)
		c.WorkerJobsFailed.Store(failedJobs)
	}

	// Active worker jobs (currently in 'sending' status)
	var active int64
	_ = c.db.QueryRow(ctx, `SELECT COUNT(*) FROM notification_deliveries WHERE status = 'sending'`).Scan(&active)
	c.WorkerActive.Store(active)

	// Queue metrics
	var pubTotal, pubFailed, consTotal, retryTotal, dlTotal int64
	_ = c.db.QueryRow(ctx, `SELECT COUNT(*) FROM queue_metrics WHERE event_type = 'published'`).Scan(&pubTotal)
	_ = c.db.QueryRow(ctx, `SELECT COUNT(*) FROM queue_metrics WHERE event_type = 'publish_failed'`).Scan(&pubFailed)
	_ = c.db.QueryRow(ctx, `SELECT COUNT(*) FROM queue_metrics WHERE event_type = 'consumed'`).Scan(&consTotal)
	_ = c.db.QueryRow(ctx, `SELECT COUNT(*) FROM notification_deliveries WHERE attempt_count > 1`).Scan(&retryTotal)
	_ = c.db.QueryRow(ctx, `SELECT COUNT(*) FROM notification_deliveries WHERE status = 'dead'`).Scan(&dlTotal)
	c.QueuePublishTotal.Store(pubTotal)
	c.QueuePublishFailed.Store(pubFailed)
	c.QueueConsumeTotal.Store(consTotal)
	c.RetryQueueTotal.Store(retryTotal)
	c.DeadLetterTotal.Store(dlTotal)

	// Provider metrics
	type providerKey struct{ provider, channel string }
	pSend := map[providerKey]int64{}
	pFailed := map[providerKey]int64{}
	pRows, err := c.db.Query(ctx, `
		SELECT tpc.provider, tpc.channel, da.status
		FROM delivery_attempts da
		JOIN notification_deliveries nd ON nd.id = da.delivery_id
		JOIN tenant_provider_configs tpc ON tpc.tenant_id = nd.tenant_id AND tpc.channel = nd.channel
	`)
	if err == nil {
		defer pRows.Close()
		for pRows.Next() {
			var provider, channel, status string
			if err := pRows.Scan(&provider, &channel, &status); err != nil {
				continue
			}
			k := providerKey{provider, channel}
			if status == "sent" {
				pSend[k]++
			} else if status == "failed" {
				pFailed[k]++
			}
		}
		c.providerMu.Lock()
		c.ProviderSendTotal = make(map[string]int64, len(pSend))
		c.ProviderSendFailed = make(map[string]int64, len(pFailed))
		for k, v := range pSend {
			c.ProviderSendTotal[k.provider+":"+k.channel] = v
		}
		for k, v := range pFailed {
			c.ProviderSendFailed[k.provider+":"+k.channel] = v
		}
		c.providerMu.Unlock()
	}
}

// Request metrics
func (c *Collector) RecordRequest(method, pathGroup string, status int, duration time.Duration) {
	c.reqCount.mu.Lock()
	c.reqCount.counts[fmt.Sprintf("%s %dxx", method, status/100)]++
	c.reqCount.mu.Unlock()

	sec := duration.Seconds()
	c.reqDuration.mu.Lock()
	c.reqDuration.sum += sec
	c.reqDuration.count++
	switch {
	case sec <= 0.1:
		c.reqDuration.buckets[0]++
	case sec <= 0.5:
		c.reqDuration.buckets[1]++
	case sec <= 1:
		c.reqDuration.buckets[2]++
	case sec <= 5:
		c.reqDuration.buckets[3]++
	default:
		c.reqDuration.buckets[4]++
	}
	c.reqDuration.mu.Unlock()
}

// WS metrics
func (c *Collector) IncWSMessageSent()     { c.WSMessagesSent.Add(1) }
func (c *Collector) IncWSMessageAcked()    { c.WSMessagesAcked.Add(1) }
func (c *Collector) IncWSDisconnect()      { c.WSDisconnects.Add(1) }
func (c *Collector) IncWSReconnectSync()   { c.WSReconnectSyncs.Add(1) }
func (c *Collector) SetWSConnections(n int64) { c.WSConnectionsActive.Store(n) }

// Panic
func (c *Collector) IncPanic() { c.PanicsTotal.Add(1) }

// Queue metrics
func (c *Collector) IncQueueJobProcessed()  { c.QueueJobsProcessed.Add(1) }
func (c *Collector) IncQueueJobFailed()     { c.QueueJobsFailed.Add(1) }
func (c *Collector) IncQueuePublish()       { c.QueuePublishTotal.Add(1) }
func (c *Collector) IncQueuePublishFailed() { c.QueuePublishFailed.Add(1) }
func (c *Collector) IncQueueConsume()       { c.QueueConsumeTotal.Add(1) }

// Worker metrics
func (c *Collector) IncWorkerStarted()     { c.WorkerJobsStarted.Add(1) }
func (c *Collector) IncWorkerCompleted()   { c.WorkerJobsCompleted.Add(1) }
func (c *Collector) IncWorkerFailed()      { c.WorkerJobsFailed.Add(1) }
