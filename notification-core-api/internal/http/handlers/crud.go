package handlers

import (
	"net/http"
	"strconv"
	"time"

	"notification-core-api/internal/audit"
	httpmw "notification-core-api/internal/http/middleware"
)

// Contacts

func (h Handler) ListContacts(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	tenantFilter := r.URL.Query().Get("tenant_id")
	q := `SELECT c.id::text, c.tenant_id::text, COALESCE(c.external_user_id,''), COALESCE(c.name,''), COALESCE(c.email,''), COALESCE(c.phone,''), c.status, c.created_at`
	args := []any{}
	if p.IsPlatform {
		q += `, COALESCE(t.name,'') AS tenant_name FROM contacts c LEFT JOIN tenants t ON t.id = c.tenant_id`
		if tenantFilter != "" {
			q += ` WHERE c.tenant_id = $1`
			args = append(args, tenantFilter)
		}
	} else {
		q += ` FROM contacts c WHERE c.tenant_id = $1`
		args = append(args, p.TenantID)
	}
	q += ` ORDER BY c.created_at DESC`
	rows, err := h.db.Query(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, tenantID, extUserID, name, email, phone, status string
		var createdAt time.Time
		if p.IsPlatform {
			var tenantName string
			if err := rows.Scan(&id, &tenantID, &extUserID, &name, &email, &phone, &status, &createdAt, &tenantName); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
				return
			}
			items = append(items, map[string]any{"id": id, "tenant_id": tenantID, "tenant_name": tenantName, "external_user_id": extUserID, "name": name, "email": email, "phone": phone, "status": status, "created_at": createdAt})
		} else {
			if err := rows.Scan(&id, &tenantID, &extUserID, &name, &email, &phone, &status, &createdAt); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
				return
			}
			items = append(items, map[string]any{"id": id, "tenant_id": tenantID, "external_user_id": extUserID, "name": name, "email": email, "phone": phone, "status": status, "created_at": createdAt})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) CreateContact(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID       string `json:"tenant_id"`
		ExternalUserID string `json:"external_user_id"`
		Name           string `json:"name"`
		Email          string `json:"email"`
		Phone          string `json:"phone"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	tenantID := req.TenantID
	if !p.IsPlatform {
		tenantID = p.TenantID
	}
	var id string
	if err := h.db.QueryRow(r.Context(), `INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status) VALUES ($1,$2,$3,$4,$5,'active') RETURNING id::text`, nullIfEmpty(tenantID), nullIfEmpty(req.ExternalUserID), nullIfEmpty(req.Name), nullIfEmpty(req.Email), nullIfEmpty(req.Phone)).Scan(&id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "create failed", "detail": err.Error()})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		TenantID:     tenantID,
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "contact.create",
		ResourceType: "contact",
		ResourceID:   id,
		After:        map[string]any{"name": req.Name, "email": req.Email},
	})
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "message": "contact created"})
}

func (h Handler) UpdateContact(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Name  string `json:"name"`
		Email string `json:"email"`
		Phone string `json:"phone"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	q := `UPDATE contacts SET updated_at = now()`
	args := []any{}
	argN := 1
	if req.Name != "" {
		q += ", name = $" + itoa(argN)
		args = append(args, req.Name)
		argN++
	}
	if req.Email != "" {
		q += ", email = $" + itoa(argN)
		args = append(args, req.Email)
		argN++
	}
	if req.Phone != "" {
		q += ", phone = $" + itoa(argN)
		args = append(args, req.Phone)
		argN++
	}
	q += " WHERE id = $" + itoa(argN)
	args = append(args, id)
	argN++
	if !p.IsPlatform {
		q += " AND tenant_id = $" + itoa(argN)
		args = append(args, p.TenantID)
		argN++
	}
	result, err := h.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "contact not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "contact.update",
		ResourceType: "contact",
		ResourceID:   id,
	})
	writeJSON(w, http.StatusOK, map[string]any{"message": "contact updated"})
}

func (h Handler) DeleteContact(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, _ := httpmw.Principal(r.Context())
	q := `DELETE FROM contacts WHERE id = $1`
	args := []any{id}
	if !p.IsPlatform {
		q += " AND tenant_id = $2"
		args = append(args, p.TenantID)
	}
	result, err := h.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "delete failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "contact not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "contact.delete",
		ResourceType: "contact",
		ResourceID:   id,
	})
	writeJSON(w, http.StatusOK, map[string]any{"message": "contact deleted"})
}

// Contact Groups

func (h Handler) ListGroups(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	tenantFilter := r.URL.Query().Get("tenant_id")
	q := `SELECT cg.id::text, cg.tenant_id::text, cg.name, COALESCE(cg.description,''), cg.status, cg.created_at, (SELECT COUNT(*) FROM contact_group_members cgm WHERE cgm.group_id = cg.id) AS member_count`
	args := []any{}
	if p.IsPlatform {
		q += `, COALESCE(t.name,'') AS tenant_name FROM contact_groups cg LEFT JOIN tenants t ON t.id = cg.tenant_id`
		if tenantFilter != "" {
			q += ` WHERE cg.tenant_id = $1`
			args = append(args, tenantFilter)
		}
	} else {
		q += ` FROM contact_groups cg WHERE cg.tenant_id = $1`
		args = append(args, p.TenantID)
	}
	q += ` ORDER BY cg.created_at DESC`
	rows, err := h.db.Query(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, tenantID, name, description, status string
		var memberCount int
		var createdAt time.Time
		if p.IsPlatform {
			var tenantName string
			if err := rows.Scan(&id, &tenantID, &name, &description, &status, &createdAt, &memberCount, &tenantName); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
				return
			}
			items = append(items, map[string]any{"id": id, "tenant_id": tenantID, "tenant_name": tenantName, "name": name, "description": description, "status": status, "member_count": memberCount, "created_at": createdAt})
		} else {
			if err := rows.Scan(&id, &tenantID, &name, &description, &status, &createdAt, &memberCount); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
				return
			}
			items = append(items, map[string]any{"id": id, "tenant_id": tenantID, "name": name, "description": description, "status": status, "member_count": memberCount, "created_at": createdAt})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) CreateGroup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID    string `json:"tenant_id"`
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	tenantID := req.TenantID
	if !p.IsPlatform {
		tenantID = p.TenantID
	}
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "name is required"})
		return
	}
	var id string
	if err := h.db.QueryRow(r.Context(), `INSERT INTO contact_groups (tenant_id, name, description, status) VALUES ($1,$2,$3,'active') RETURNING id::text`, nullIfEmpty(tenantID), req.Name, nullIfEmpty(req.Description)).Scan(&id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "create failed"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		TenantID:     tenantID,
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "contact_group.create",
		ResourceType: "contact_group",
		ResourceID:   id,
	})
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "message": "group created"})
}

func (h Handler) DeleteGroup(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, _ := httpmw.Principal(r.Context())
	q := `DELETE FROM contact_groups WHERE id = $1`
	args := []any{id}
	if !p.IsPlatform {
		q += " AND tenant_id = $2"
		args = append(args, p.TenantID)
	}
	result, err := h.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "delete failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "group not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "contact_group.delete",
		ResourceType: "contact_group",
		ResourceID:   id,
	})
	writeJSON(w, http.StatusOK, map[string]any{"message": "group deleted"})
}

// Templates

func (h Handler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	tenantFilter := r.URL.Query().Get("tenant_id")
	q := `SELECT nt.id::text, nt.tenant_id::text, nt.template_key, COALESCE(nt.channel,''), COALESCE(nt.subject,''), nt.body, nt.status, nt.created_at`
	args := []any{}
	if p.IsPlatform {
		q += `, COALESCE(t.name,'') AS tenant_name FROM notification_templates nt LEFT JOIN tenants t ON t.id = nt.tenant_id`
		if tenantFilter != "" {
			q += ` WHERE nt.tenant_id = $1`
			args = append(args, tenantFilter)
		}
	} else {
		q += ` FROM notification_templates nt WHERE nt.tenant_id = $1`
		args = append(args, p.TenantID)
	}
	q += ` ORDER BY nt.created_at DESC`
	rows, err := h.db.Query(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, tenantID, key, channel, subject, body, status string
		var createdAt time.Time
		if p.IsPlatform {
			var tenantName string
			if err := rows.Scan(&id, &tenantID, &key, &channel, &subject, &body, &status, &createdAt, &tenantName); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
				return
			}
			items = append(items, map[string]any{"id": id, "tenant_id": tenantID, "tenant_name": tenantName, "template_key": key, "channel": channel, "subject": subject, "body": body, "status": status, "created_at": createdAt})
		} else {
			if err := rows.Scan(&id, &tenantID, &key, &channel, &subject, &body, &status, &createdAt); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
				return
			}
			items = append(items, map[string]any{"id": id, "tenant_id": tenantID, "template_key": key, "channel": channel, "subject": subject, "body": body, "status": status, "created_at": createdAt})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID    string `json:"tenant_id"`
		TemplateKey string `json:"template_key"`
		Channel     string `json:"channel"`
		Subject     string `json:"subject"`
		Body        string `json:"body"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	tenantID := req.TenantID
	if !p.IsPlatform {
		tenantID = p.TenantID
	}
	if req.TemplateKey == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "template_key is required"})
		return
	}
	var id string
	if err := h.db.QueryRow(r.Context(), `INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status) VALUES ($1,$2,$3,$4,$5,'active') RETURNING id::text`, nullIfEmpty(tenantID), req.TemplateKey, nullIfEmpty(req.Channel), nullIfEmpty(req.Subject), nullIfEmpty(req.Body)).Scan(&id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "create failed", "detail": err.Error()})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		TenantID:     tenantID,
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "template.create",
		ResourceType: "notification_template",
		ResourceID:   id,
	})
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "message": "template created"})
}

func (h Handler) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		TemplateKey string `json:"template_key"`
		Channel     string `json:"channel"`
		Subject     string `json:"subject"`
		Body        string `json:"body"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	if req.TemplateKey == "" || req.Channel == "" || req.Body == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "template_key, channel, and body are required"})
		return
	}
	q := `UPDATE notification_templates SET template_key = $1, channel = $2, subject = $3, body = $4, updated_at = now() WHERE id = $5`
	args := []any{req.TemplateKey, req.Channel, nullIfEmpty(req.Subject), req.Body, id}
	if !p.IsPlatform {
		q += " AND tenant_id = $6"
		args = append(args, p.TenantID)
	}
	result, err := h.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "template not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "template.update",
		ResourceType: "notification_template",
		ResourceID:   id,
	})
	writeJSON(w, http.StatusOK, map[string]any{"message": "template updated"})
}

func (h Handler) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, _ := httpmw.Principal(r.Context())
	q := `DELETE FROM notification_templates WHERE id = $1`
	args := []any{id}
	if !p.IsPlatform {
		q += " AND tenant_id = $2"
		args = append(args, p.TenantID)
	}
	result, err := h.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "delete failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "template not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "template.delete",
		ResourceType: "notification_template",
		ResourceID:   id,
	})
	writeJSON(w, http.StatusOK, map[string]any{"message": "template deleted"})
}

// Campaigns

func (h Handler) ListCampaigns(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	tenantFilter := r.URL.Query().Get("tenant_id")
	q := `SELECT c.id::text, c.tenant_id::text, c.name, COALESCE(c.description,''), c.status, COALESCE(c.scheduled_at::text,''), c.created_at`
	args := []any{}
	if p.IsPlatform {
		q += `, COALESCE(t.name,'') AS tenant_name FROM campaigns c LEFT JOIN tenants t ON t.id = c.tenant_id`
		if tenantFilter != "" {
			q += ` WHERE c.tenant_id = $1`
			args = append(args, tenantFilter)
		}
	} else {
		q += ` FROM campaigns c WHERE c.tenant_id = $1`
		args = append(args, p.TenantID)
	}
	q += ` ORDER BY c.created_at DESC`
	rows, err := h.db.Query(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, tenantID, name, description, status, scheduledAt string
		var createdAt time.Time
		if p.IsPlatform {
			var tenantName string
			if err := rows.Scan(&id, &tenantID, &name, &description, &status, &scheduledAt, &createdAt, &tenantName); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
				return
			}
			items = append(items, map[string]any{"id": id, "tenant_id": tenantID, "tenant_name": tenantName, "name": name, "description": description, "status": status, "scheduled_at": scheduledAt, "created_at": createdAt})
		} else {
			if err := rows.Scan(&id, &tenantID, &name, &description, &status, &scheduledAt, &createdAt); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
				return
			}
			items = append(items, map[string]any{"id": id, "tenant_id": tenantID, "name": name, "description": description, "status": status, "scheduled_at": scheduledAt, "created_at": createdAt})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) CreateCampaign(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID    string `json:"tenant_id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		Channel     string `json:"channel"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	tenantID := req.TenantID
	if !p.IsPlatform {
		tenantID = p.TenantID
	}
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "name is required"})
		return
	}
	var id string
	if err := h.db.QueryRow(r.Context(), `INSERT INTO campaigns (tenant_id, name, description, status) VALUES ($1,$2,$3,'draft') RETURNING id::text`, nullIfEmpty(tenantID), req.Name, nullIfEmpty(req.Description)).Scan(&id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "create failed", "detail": err.Error()})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		TenantID:     tenantID,
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "campaign.create",
		ResourceType: "campaign",
		ResourceID:   id,
	})
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "message": "campaign created"})
}

func (h Handler) UpdateCampaign(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Status      string `json:"status"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	q := `UPDATE campaigns SET updated_at = now()`
	args := []any{}
	argN := 1
	if req.Name != "" {
		q += ", name = $" + itoa(argN)
		args = append(args, req.Name)
		argN++
	}
	if req.Description != "" {
		q += ", description = $" + itoa(argN)
		args = append(args, req.Description)
		argN++
	}
	if req.Status != "" {
		q += ", status = $" + itoa(argN)
		args = append(args, req.Status)
		argN++
	}
	q += " WHERE id = $" + itoa(argN)
	args = append(args, id)
	argN++
	if !p.IsPlatform {
		q += " AND tenant_id = $" + itoa(argN)
		args = append(args, p.TenantID)
		argN++
	}
	result, err := h.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "campaign not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "campaign.update",
		ResourceType: "campaign",
		ResourceID:   id,
	})
	writeJSON(w, http.StatusOK, map[string]any{"message": "campaign updated"})
}

type campaignAction struct {
	TargetStatus string
	AuditAction  string
}

func (h Handler) campaignStatusTransition(w http.ResponseWriter, r *http.Request, action campaignAction) {
	id := r.PathValue("id")
	p, _ := httpmw.Principal(r.Context())
	q := `UPDATE campaigns SET status = $2, updated_at = now() WHERE id = $1`
	args := []any{id, action.TargetStatus}
	if !p.IsPlatform {
		q += ` AND tenant_id = $3`
		args = append(args, p.TenantID)
	}
	result, err := h.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "operation failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "campaign not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       action.AuditAction,
		ResourceType: "campaign",
		ResourceID:   id,
	})
	writeJSON(w, http.StatusOK, map[string]any{"message": "campaign " + action.TargetStatus})
}

func (h Handler) ApproveCampaign(w http.ResponseWriter, r *http.Request) {
	h.campaignStatusTransition(w, r, campaignAction{TargetStatus: "approved", AuditAction: "campaign.approve"})
}

func (h Handler) SendCampaign(w http.ResponseWriter, r *http.Request) {
	h.campaignStatusTransition(w, r, campaignAction{TargetStatus: "sending", AuditAction: "campaign.send"})
}

func (h Handler) CancelCampaign(w http.ResponseWriter, r *http.Request) {
	h.campaignStatusTransition(w, r, campaignAction{TargetStatus: "cancelled", AuditAction: "campaign.cancel"})
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
