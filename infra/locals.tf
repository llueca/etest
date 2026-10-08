locals {
  # Server-side values: Lambda environment variables (names as in shared/config.ts).
  server_env = {
    TABLE_NAME                  = aws_dynamodb_table.players.name
    NAME_MAX_LENGTH             = tostring(var.name_max_length)
    LEADERBOARD_SIZE            = tostring(var.leaderboard_size)
    MARKET_PRODUCT_ID           = var.market_product_id
    MARKET_REST_URL             = var.market_rest_url
    MARKET_TIMEOUT_MS           = tostring(var.market_timeout_ms)
    SETTLEMENT_POLL_INTERVAL_MS = tostring(var.settlement_poll_interval_ms)
    PREDICTION_WINDOW_SECONDS   = tostring(var.prediction_window_seconds)
  }

  # Browser values: written to config.json (the SPA build does not depend on the environment).
  web_config = {
    nameMaxLength           = var.name_max_length
    marketProductId         = var.market_product_id
    marketWsUrl             = var.market_ws_url
    staleThresholdMs        = var.stale_threshold_ms
    chartWindowSeconds      = var.chart_window_seconds
    resolvePollIntervalMs   = var.resolve_poll_interval_ms
    predictionWindowSeconds = var.prediction_window_seconds
  }

  lambda_bundles = "${path.module}/../apps/server/dist/lambda"
}
