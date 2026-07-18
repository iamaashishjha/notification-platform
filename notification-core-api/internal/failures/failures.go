package failures

import "strings"

type Classification struct {
	Category        string `json:"category"`
	Code            string `json:"code"`
	Retryable       bool   `json:"retryable"`
	Explanation     string `json:"explanation"`
	SuggestedAction string `json:"suggested_action"`
}

func Normalize(status string, providerCode string, message string) Classification {
	text := strings.ToLower(strings.TrimSpace(providerCode + " " + message))
	if strings.Contains(text, "auth") || strings.Contains(text, "credential") || strings.Contains(text, "unauthorized") || strings.Contains(text, "forbidden") {
		return Classification{"provider_authentication_failure", "PROVIDER_AUTHENTICATION_FAILURE", false, "The provider rejected authentication or send permissions.", "Validate provider credentials and sender permissions."}
	}
	if strings.Contains(text, "quota") || strings.Contains(text, "limit") || strings.Contains(text, "429") {
		return Classification{"rate_limited", "RATE_LIMITED", true, "The provider or tenant throughput limit was reached.", "Wait for the rate-limit window or reduce throughput."}
	}
	if strings.Contains(text, "timeout") || strings.Contains(text, "deadline") {
		return Classification{"provider_timeout", "PROVIDER_TIMEOUT", true, "The provider did not respond within the allowed time.", "Retry through routing policy or temporarily route to a fallback provider."}
	}
	if strings.Contains(text, "network") || strings.Contains(text, "dns") || strings.Contains(text, "tls") || strings.Contains(text, "connection") {
		return Classification{"network_failure", "NETWORK_FAILURE", true, "The platform could not reach the provider reliably.", "Retry later and check provider/network health."}
	}
	if strings.Contains(text, "invalid recipient") || strings.Contains(text, "invalid destination") || strings.Contains(text, "invalid phone") || strings.Contains(text, "invalid email") {
		return Classification{"invalid_recipient", "INVALID_RECIPIENT", false, "The destination address or token is invalid.", "Update the recipient address or token before retrying."}
	}
	if strings.Contains(text, "template") || strings.Contains(text, "render") || strings.Contains(text, "variable") {
		return Classification{"rendering_failure", "RENDERING_FAILURE", false, "The notification could not be rendered from the configured template or variables.", "Fix the template or missing variables, then resend."}
	}
	if strings.EqualFold(status, "dead") {
		return Classification{"queue_processing_failure", "QUEUE_PROCESSING_FAILURE", false, "Delivery exhausted all retry attempts and was moved to dead-letter state.", "Inspect the delivery attempts, then replay only after the root cause is fixed."}
	}
	if strings.EqualFold(status, "failed") {
		return Classification{"unknown_internal_failure", "UNKNOWN_INTERNAL_FAILURE", true, "The provider or worker reported a failure that has not been mapped yet.", "Review the redacted provider response and retry if the destination and configuration are valid."}
	}
	return Classification{"none", "NONE", false, "No failure was detected.", "No action required."}
}
