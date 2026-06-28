package auth

import (
	"context"
	"testing"
)

func TestHasPermission(t *testing.T) {
	svc := Service{}
	if !svc.HasPermission(context.Background(), Principal{IsPlatform: true}, "anything.manage") {
		t.Fatal("platform admin should pass permission checks")
	}
	if !svc.HasPermission(context.Background(), Principal{Permissions: []string{"notifications.send"}}, "notifications.send") {
		t.Fatal("explicit permission should pass")
	}
	if svc.HasPermission(context.Background(), Principal{Permissions: []string{"notifications.view"}}, "notifications.send") {
		t.Fatal("missing permission should fail")
	}
}

func TestGranularPermissionFallback(t *testing.T) {
	svc := Service{}
	tests := []struct {
		name       string
		perms      []string
		requested  string
		want       bool
	}{
		{"broad users.manage implies users.create", []string{"users.manage"}, "users.create", true},
		{"broad users.manage implies users.delete", []string{"users.manage"}, "users.delete", true},
		{"broad users.manage implies users.view", []string{"users.manage"}, "users.view", true},
		{"broad features.manage implies features.update", []string{"features.manage"}, "features.update", true},
		{"broad features.manage implies features.view", []string{"features.manage"}, "features.view", true},
		{"broad channels.manage implies channels.update", []string{"channels.manage"}, "channels.update", true},
		{"broad providers.manage implies providers.test", []string{"providers.manage"}, "providers.test", true},
		{"broad providers.manage implies providers.delete", []string{"providers.manage"}, "providers.delete", true},
		{"broad groups.manage implies groups.members.manage", []string{"groups.manage"}, "groups.members.manage", true},
		{"broad api_keys.manage implies api_keys.revoke", []string{"api_keys.manage"}, "api_keys.revoke", true},
		{"broad campaigns.manage implies campaigns.approve", []string{"campaigns.manage"}, "campaigns.approve", true},
		{"broad templates.manage implies templates.delete", []string{"templates.manage"}, "templates.delete", true},
		{"broad contacts.manage implies contacts.update", []string{"contacts.manage"}, "contacts.update", true},
		{"broad settings.manage implies settings.view", []string{"settings.manage"}, "settings.view", true},
		{"no broad fallback for non-mapped permission", []string{"users.manage"}, "notifications.send", false},
		{"granular does not imply broad", []string{"users.create"}, "users.manage", false},
		{"empty perms always fails", []string{}, "anything.manage", false},
		{"unrelated broad does not imply", []string{"features.manage"}, "users.create", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := svc.HasPermission(context.Background(), Principal{Permissions: tt.perms}, tt.requested)
			if got != tt.want {
				t.Errorf("HasPermission(perms=%v, requested=%s) = %v, want %v", tt.perms, tt.requested, got, tt.want)
			}
		})
	}
}
