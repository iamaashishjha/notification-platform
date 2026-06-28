# WebSocket

## Overview

WebSocket connections are used for real-time delivery of in-app notifications to connected clients. The implementation uses gorilla/websocket with an in-memory connection hub.

## Architecture

```
Client → GET /ws?token=<ws_token>
         → gorilla/websocket upgrade
         → Token validation (websocket_connection_tokens table or JWT)
         → Hub.Register
         → ReadPump / WritePump goroutines
```

### Components

- **Hub**: In-memory connection manager. Maintains maps of connections by tenant for efficient broadcasting.
- **Client**: Per-connection struct with read/write pump goroutines, ping/pong heartbeat.
- **WSHandler**: HTTP handler that upgrades connections and validates tokens.

## Endpoints

### GET /ws

Upgrades to WebSocket.

**Auth**: Query param `token` or `Authorization: Bearer <token>` header.
Tokens are one-time-use, stored in `websocket_connection_tokens` table.

**Message Protocol**:

```json
// Server → Client (notification delivery)
{"type": "notification", "payload": {"notification_id": "...", "title": "...", "body": "...", "data": {...}}}

// Client → Server (acknowledgment)
{"type": "ack", "id": "<notification_id>"}

// Server → Client (heartbeat)
WebSocket Ping frame

// Client → Server (heartbeat response)
WebSocket Pong frame
```

### GET /admin/api/v1/in-app/notifications

List in-app notifications for the current tenant.

**Auth**: JWT required.
**Query params**: `status` (unread/read)

### POST /admin/api/v1/in-app/notifications/{id}/read

Mark a specific notification as read.

### POST /admin/api/v1/in-app/notifications/mark-all-read

Mark all notifications as read for the current tenant.

### POST /admin/api/v1/in-app/sync

Returns all unread in-app notifications as JSON.

## Reconnect Sync

When a client connects, the hub automatically syncs all unread in-app notifications from the database to the client. This ensures missed notifications are delivered on reconnect.

## Connection Lifecycle

1. Client requests WS token via `POST /admin/api/v1/ws/token`
2. Client connects to `GET /ws?token=<token>`
3. Token validated, connection upgraded
4. Session recorded in `websocket_sessions` table
5. Unread notifications synced
6. Read pump handles incoming messages (ack, pong)
7. Write pump sends outgoing notifications + ping frames (every 54s)
8. Idle timeout: 60s without pong → connection closed
