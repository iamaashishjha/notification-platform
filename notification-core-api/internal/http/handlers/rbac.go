package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"notification-core-api/internal/audit"
	httpmw "notification-core-api/internal/http/middleware"

	"github.com/jackc/pgx/v5"
)

func (h Handler) ListRoles(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	tenantFilter := r.URL.Query().Get("tenant_id")

	var err error
	var rows pgx.Rows
	if p.IsPlatform {
		q := `SELECT id::text, COALESCE(tenant_id::text,''), name, key, scope, status, created_at FROM roles`
		args := []any{}
		if tenantFilter != "" {
			q += ` WHERE tenant_id = $1 OR (tenant_id IS NULL AND scope = 'tenant')`
			args = append(args, tenantFilter)
		}
		q += ` ORDER BY created_at DESC LIMIT 100`
		rows, err = h.db.Query(r.Context(), q, args...)
	} else {
		rows, err = h.db.Query(r.Context(), `SELECT id::text, COALESCE(tenant_id::text,''), name, key, scope, status, created_at FROM roles WHERE scope != 'platform' AND (tenant_id = $1 OR tenant_id IS NULL) ORDER BY created_at DESC LIMIT 100`, p.TenantID)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id, tenantID, name, key, scope, status string
		var createdAt time.Time
		if err := rows.Scan(&id, &tenantID, &name, &key, &scope, &status, &createdAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"id": id, "tenant_id": tenantID, "name": name, "key": key, "scope": scope, "status": status, "created_at": createdAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) GetRole(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, _ := httpmw.Principal(r.Context())
	var roleID, tenantID, name, key, scope, status string
	var createdAt time.Time
	query := `SELECT id::text, COALESCE(tenant_id::text,''), name, key, scope, status, created_at FROM roles WHERE id = $1`
	err := h.db.QueryRow(r.Context(), query, id).Scan(&roleID, &tenantID, &name, &key, &scope, &status, &createdAt)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "role not found"})
		return
	}
	if !p.IsPlatform && tenantID != "" && tenantID != p.TenantID {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "access denied"})
		return
	}

	permRows, err := h.db.Query(r.Context(), `SELECT p.id::text, p.key, p.description FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = $1 ORDER BY p.key`, id)
	if err == nil {
		defer permRows.Close()
	}
	perms := []map[string]any{}
	if err == nil {
		for permRows.Next() {
			var pid, pkey, pdesc string
			if permRows.Scan(&pid, &pkey, &pdesc) == nil {
				perms = append(perms, map[string]any{"id": pid, "key": pkey, "description": pdesc})
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"id": roleID, "tenant_id": tenantID, "name": name, "key": key, "scope": scope, "status": status, "created_at": createdAt,
		"permissions": perms,
	}})
}

func (h Handler) CreateRole(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID string `json:"tenant_id"`
		Name     string `json:"name"`
		Key      string `json:"key"`
		Scope    string `json:"scope"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	if req.Name == "" || req.Key == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "name and key are required"})
		return
	}
	scope := req.Scope
	if scope == "" {
		scope = "tenant"
	}
	p, _ := httpmw.Principal(r.Context())
	tenantID := req.TenantID
	if !p.IsPlatform {
		tenantID = p.TenantID
		if scope == "platform" {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "cannot create platform-scoped role"})
			return
		}
	}
	if scope != "tenant" && scope != "platform" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "scope must be tenant or platform"})
		return
	}
	if scope == "tenant" && tenantID == "" && !p.IsPlatform {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "tenant_id is required for tenant-scoped roles"})
		return
	}
	if scope == "platform" {
		tenantID = ""
	}

	var id string
	if err := h.db.QueryRow(r.Context(), `INSERT INTO roles (tenant_id, name, key, scope, status) VALUES ($1,$2,$3,$4,'active') RETURNING id::text`, nullIfEmpty(tenantID), req.Name, req.Key, scope).Scan(&id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "create failed", "detail": err.Error()})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		TenantID:     tenantID,
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "role.create",
		ResourceType: "role",
		ResourceID:   id,
		After:        map[string]any{"name": req.Name, "key": req.Key, "scope": scope},
	})
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "message": "role created"})
}

func (h Handler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Name   string `json:"name"`
		Status string `json:"status"`
		Scope  string `json:"scope"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())

	var existingScope, existingTenantID string
	h.db.QueryRow(r.Context(), `SELECT scope, COALESCE(tenant_id::text,'') FROM roles WHERE id = $1`, id).Scan(&existingScope, &existingTenantID)
	if !p.IsPlatform && (existingScope == "platform" || existingTenantID == "") {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "cannot modify this role"})
		return
	}

	query := `UPDATE roles SET updated_at = now()`
	args := []any{}
	argN := 1
	if req.Name != "" {
		query += ", name = $" + strconv.Itoa(argN)
		args = append(args, req.Name)
		argN++
	}
	if req.Status != "" {
		query += ", status = $" + strconv.Itoa(argN)
		args = append(args, req.Status)
		argN++
	}
	if req.Scope != "" && p.IsPlatform {
		query += ", scope = $" + strconv.Itoa(argN)
		args = append(args, req.Scope)
		argN++
	}
	query += " WHERE id = $" + strconv.Itoa(argN)
	args = append(args, id)
	if !p.IsPlatform {
		query += " AND tenant_id = $" + strconv.Itoa(argN+1)
		args = append(args, p.TenantID)
	}
	result, err := h.db.Exec(r.Context(), query, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "role not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "role.update",
		ResourceType: "role",
		ResourceID:   id,
	})
	writeJSON(w, http.StatusOK, map[string]any{"message": "role updated"})
}

func (h Handler) DeleteRole(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, _ := httpmw.Principal(r.Context())

	var existingScope, existingTenantID string
	h.db.QueryRow(r.Context(), `SELECT scope, COALESCE(tenant_id::text,'') FROM roles WHERE id = $1`, id).Scan(&existingScope, &existingTenantID)
	if !p.IsPlatform && (existingScope == "platform" || existingTenantID == "") {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "cannot delete this role"})
		return
	}

	query := `DELETE FROM roles WHERE id = $1`
	args := []any{id}
	if !p.IsPlatform {
		query += " AND tenant_id = $2"
		args = append(args, p.TenantID)
	}
	result, err := h.db.Exec(r.Context(), query, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "delete failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "role not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "role.delete",
		ResourceType: "role",
		ResourceID:   id,
	})
	writeJSON(w, http.StatusOK, map[string]any{"message": "role deleted"})
}

func (h Handler) SetRolePermissions(w http.ResponseWriter, r *http.Request) {
	roleID := r.PathValue("id")
	var req struct {
		PermissionIDs []string `json:"permission_ids"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())

	var existingScope, existingTenantID string
	h.db.QueryRow(r.Context(), `SELECT scope, COALESCE(tenant_id::text,'') FROM roles WHERE id = $1`, roleID).Scan(&existingScope, &existingTenantID)
	if !p.IsPlatform && (existingScope == "platform" || existingTenantID == "") {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "cannot modify this role permissions"})
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "tx begin failed"})
		return
	}
	defer tx.Rollback(r.Context())

	if _, err := tx.Exec(r.Context(), `DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "clear failed"})
		return
	}
	for _, pid := range req.PermissionIDs {
		if _, err := tx.Exec(r.Context(), `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, roleID, pid); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "assign failed"})
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "tx commit failed"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "role.permissions.update",
		ResourceType: "role",
		ResourceID:   roleID,
	})
	writeJSON(w, http.StatusOK, map[string]any{"message": "permissions updated"})
}

func (h Handler) AssignRolePermission(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RoleID       string `json:"role_id"`
		PermissionID string `json:"permission_id"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	_, err := h.db.Exec(r.Context(), `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, req.RoleID, req.PermissionID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "assign failed"})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"message": "permission assigned"})
}

func (h Handler) RemoveRolePermission(w http.ResponseWriter, r *http.Request) {
	roleID := r.PathValue("role_id")
	permID := r.PathValue("perm_id")
	_, err := h.db.Exec(r.Context(), `DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2`, roleID, permID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "remove failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "permission removed"})
}

func (h Handler) ListRolePermissions(w http.ResponseWriter, r *http.Request) {
	roleID := r.PathValue("id")
	rows, err := h.db.Query(r.Context(), `
SELECT p.id::text, p.key, p.description
FROM permissions p
JOIN role_permissions rp ON rp.permission_id = p.id
WHERE rp.role_id = $1
ORDER BY p.key`, roleID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, key, desc string
		if err := rows.Scan(&id, &key, &desc); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"id": id, "key": key, "description": desc})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) ListUserRoles(w http.ResponseWriter, r *http.Request) {
	userID := r.PathValue("user_id")
	rows, err := h.db.Query(r.Context(), `
SELECT r.id::text, r.name, r.key, r.scope, COALESCE(ur.tenant_id::text,''), ur.created_at
FROM roles r
JOIN user_roles ur ON ur.role_id = r.id
WHERE ur.user_id = $1
ORDER BY r.name`, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, name, key, scope, tenantID string
		var createdAt time.Time
		if err := rows.Scan(&id, &name, &key, &scope, &tenantID, &createdAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"id": id, "name": name, "key": key, "scope": scope, "tenant_id": tenantID, "assigned_at": createdAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) AssignUserRole(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID string `json:"tenant_id"`
		RoleID   string `json:"role_id"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	userID := r.PathValue("user_id")
	p, _ := httpmw.Principal(r.Context())
	tenantID := req.TenantID
	if !p.IsPlatform {
		tenantID = p.TenantID
	}

	var roleScope string
	h.db.QueryRow(r.Context(), `SELECT scope FROM roles WHERE id = $1`, req.RoleID).Scan(&roleScope)
	if !p.IsPlatform && roleScope == "platform" {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "cannot assign platform role"})
		return
	}
	if roleScope == "tenant" && tenantID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "tenant_id is required for tenant role assignment"})
		return
	}

	var id string
	if err := h.db.QueryRow(r.Context(), `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1,$2,$3) RETURNING id::text`, nullIfEmpty(tenantID), userID, req.RoleID).Scan(&id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "assign failed", "detail": err.Error()})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		TenantID:     tenantID,
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "user_role.assign",
		ResourceType: "user_role",
		ResourceID:   id,
		After:        map[string]any{"user_id": userID, "role_id": req.RoleID},
	})
	_ = h.auth.InvalidatePermissionCache(r.Context(), userID, tenantID)
	writeJSON(w, http.StatusCreated, map[string]any{"message": "role assigned"})
}

func (h Handler) RemoveUserRole(w http.ResponseWriter, r *http.Request) {
	userID := r.PathValue("user_id")
	roleID := r.PathValue("role_id")
	p, _ := httpmw.Principal(r.Context())

	var roleScope string
	h.db.QueryRow(r.Context(), `SELECT scope FROM roles WHERE id = $1`, roleID).Scan(&roleScope)
	if !p.IsPlatform && roleScope == "platform" {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "cannot remove platform role"})
		return
	}

	result, err := h.db.Exec(r.Context(), `DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`, userID, roleID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "remove failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "assignment not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		ActorUserID: p.UserID,
		ActorType:   "tenant_user",
		Action:      "user_role.remove",
		After:       map[string]any{"user_id": userID, "role_id": roleID},
	})
	_ = h.auth.InvalidatePermissionCache(r.Context(), userID, p.TenantID)
	writeJSON(w, http.StatusOK, map[string]any{"message": "role removed"})
}

func (h Handler) ListPermissions(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
SELECT p.id::text, p.key, p.description,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('id', r.id::text, 'name', r.name, 'key', r.key, 'scope', r.scope))
     FROM role_permissions rp
     JOIN roles r ON r.id = rp.role_id
     WHERE rp.permission_id = p.id),
    '[]'::jsonb
  ) AS roles
FROM permissions p ORDER BY p.key`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, key, desc string
		var rolesJSON []byte
		if err := rows.Scan(&id, &key, &desc, &rolesJSON); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"id": id, "key": key, "description": desc, "roles": json.RawMessage(rolesJSON)})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}
