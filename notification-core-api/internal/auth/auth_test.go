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
