data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${local.lambda_bundles}/api"
  output_path = "${local.lambda_bundles}/../api.zip"
}

data "archive_file" "settler" {
  type        = "zip"
  source_dir  = "${local.lambda_bundles}/settler"
  output_path = "${local.lambda_bundles}/../settler.zip"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.name}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "settler" {
  name              = "/aws/lambda/${var.name}-settler"
  retention_in_days = var.log_retention_days
}

# --- API Lambda: reads and writes players; never needs more than these actions. ---

resource "aws_iam_role" "api" {
  name               = "${var.name}-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "api" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }
  statement {
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.players.arn]
  }
  statement {
    actions   = ["dynamodb:Query"]
    resources = ["${aws_dynamodb_table.players.arn}/index/score-lb", "${aws_dynamodb_table.players.arn}/index/accuracy-lb"]
  }
}

resource "aws_iam_role_policy" "api" {
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.name}-api"
  role             = aws_iam_role.api.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  memory_size      = 256
  timeout          = 10

  environment {
    variables = local.server_env
  }

  depends_on = [aws_cloudwatch_log_group.api]
}

# --- Settler Lambda: settles due predictions; cannot create players. ---

resource "aws_iam_role" "settler" {
  name               = "${var.name}-settler"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "settler" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.settler.arn}:*"]
  }
  statement {
    actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.players.arn]
  }
  statement {
    actions   = ["dynamodb:Query"]
    resources = ["${aws_dynamodb_table.players.arn}/index/pending"]
  }
}

resource "aws_iam_role_policy" "settler" {
  role   = aws_iam_role.settler.id
  policy = data.aws_iam_policy_document.settler.json
}

resource "aws_lambda_function" "settler" {
  function_name    = "${var.name}-settler"
  role             = aws_iam_role.settler.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.settler.output_path
  source_code_hash = data.archive_file.settler.output_base64sha256
  # Mostly waits on network calls; 128 MB keeps the always-busy worst case near 324k GB-s a month.
  memory_size = 128
  # The loop runs for up to 60 s (design D3).
  timeout = 75

  environment {
    variables = local.server_env
  }

  depends_on = [aws_cloudwatch_log_group.settler]
}

# --- Settler schedule: every minute; idle invocations exit after one query. ---

resource "aws_cloudwatch_event_rule" "settler" {
  name                = "${var.name}-settler"
  schedule_expression = "rate(1 minute)"
}

resource "aws_cloudwatch_event_target" "settler" {
  rule = aws_cloudwatch_event_rule.settler.name
  arn  = aws_lambda_function.settler.arn
}

resource "aws_lambda_permission" "settler" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.settler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.settler.arn
}
