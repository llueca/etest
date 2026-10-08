variable "region" {
  description = "AWS region for everything except CloudFront."
  type        = string
  default     = "eu-central-1"
}

variable "name" {
  description = "Prefix for resource names."
  type        = string
  default     = "btc-up-down"
}

variable "log_retention_days" {
  description = "CloudWatch log retention."
  type        = number
  default     = 14
}

# --- Operational configuration (design D10). Defaults match shared/config.ts. ---

variable "name_max_length" {
  type    = number
  default = 24
  validation {
    condition     = var.name_max_length >= 1 && floor(var.name_max_length) == var.name_max_length
    error_message = "name_max_length must be a whole number of at least 1."
  }
}

variable "leaderboard_size" {
  type    = number
  default = 10
  validation {
    condition     = var.leaderboard_size >= 1 && floor(var.leaderboard_size) == var.leaderboard_size
    error_message = "leaderboard_size must be a whole number of at least 1."
  }
}

variable "market_product_id" {
  type    = string
  default = "BTC-USD"
}

variable "market_rest_url" {
  type    = string
  default = "https://api.exchange.coinbase.com"
}

variable "market_ws_url" {
  type    = string
  default = "wss://ws-feed.exchange.coinbase.com"
}

variable "market_timeout_ms" {
  type    = number
  default = 3000
  validation {
    condition     = var.market_timeout_ms >= 1 && floor(var.market_timeout_ms) == var.market_timeout_ms
    error_message = "market_timeout_ms must be a whole number of at least 1."
  }
}

variable "settlement_poll_interval_ms" {
  type    = number
  default = 1000
  validation {
    condition     = var.settlement_poll_interval_ms >= 1 && floor(var.settlement_poll_interval_ms) == var.settlement_poll_interval_ms
    error_message = "settlement_poll_interval_ms must be a whole number of at least 1."
  }
}

variable "stale_threshold_ms" {
  type    = number
  default = 10000
  validation {
    condition     = var.stale_threshold_ms >= 1 && floor(var.stale_threshold_ms) == var.stale_threshold_ms
    error_message = "stale_threshold_ms must be a whole number of at least 1."
  }
}

variable "chart_window_seconds" {
  description = "Time shown by the live chart. 60 s fits a whole prediction; 600 s caps the points redrawn per frame."
  type        = number
  default     = 120
  validation {
    condition     = var.chart_window_seconds >= 60 && var.chart_window_seconds <= 600 && floor(var.chart_window_seconds) == var.chart_window_seconds
    error_message = "chart_window_seconds must be a whole number from 60 to 600."
  }
}

variable "resolve_poll_interval_ms" {
  type    = number
  default = 2000
  validation {
    condition     = var.resolve_poll_interval_ms >= 1 && floor(var.resolve_poll_interval_ms) == var.resolve_poll_interval_ms
    error_message = "resolve_poll_interval_ms must be a whole number of at least 1."
  }
}

variable "prediction_window_seconds" {
  description = "Time from a prediction's creation to its eligibility. Applies to new predictions only."
  type        = number
  default     = 60
  validation {
    # The once-a-minute settler relies on predictions being created at least 60 s before eligibility.
    condition     = var.prediction_window_seconds >= 60 && floor(var.prediction_window_seconds) == var.prediction_window_seconds
    error_message = "prediction_window_seconds must be a whole number of at least 60."
  }
}
