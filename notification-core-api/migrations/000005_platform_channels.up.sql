CREATE TABLE platform_channels (
    channel text PRIMARY KEY,
    description text NOT NULL DEFAULT '',
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_channels (channel, description) VALUES
('email','Email delivery via SMTP, SendGrid, or SES'),
('sms','SMS delivery via Twilio, Sparrow, or HTTP gateway'),
('fcm','Firebase Cloud Messaging for Android/iOS push'),
('websocket','Real-time browser notifications via WebSocket'),
('in_app','In-app notification center with offline sync'),
('whatsapp','WhatsApp Business API messaging'),
('web_push','Browser push notifications');
