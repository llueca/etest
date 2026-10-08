# One item per player (design D4). Same shape as scripts/table.ts for DynamoDB Local.
resource "aws_dynamodb_table" "players" {
  name         = "${var.name}-players"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "playerId"

  attribute {
    name = "playerId"
    type = "S"
  }
  attribute {
    name = "pendingKey"
    type = "S"
  }
  attribute {
    name = "pendingEligibleAt"
    type = "N"
  }
  attribute {
    name = "lbKey"
    type = "S"
  }
  attribute {
    name = "scoreRankKey"
    type = "S"
  }
  attribute {
    name = "accuracyRankKey"
    type = "S"
  }

  global_secondary_index {
    name = "pending"

    key_schema {
      attribute_name = "pendingKey"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "pendingEligibleAt"
      key_type       = "RANGE"
    }

    projection_type = "KEYS_ONLY"
  }

  global_secondary_index {
    name = "score-lb"

    key_schema {
      attribute_name = "lbKey"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "scoreRankKey"
      key_type       = "RANGE"
    }

    projection_type    = "INCLUDE"
    non_key_attributes = ["displayName", "score", "wins", "losses", "createdAt"]
  }

  global_secondary_index {
    name = "accuracy-lb"

    key_schema {
      attribute_name = "lbKey"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "accuracyRankKey"
      key_type       = "RANGE"
    }

    projection_type    = "INCLUDE"
    non_key_attributes = ["displayName", "score", "wins", "losses", "createdAt"]
  }

  point_in_time_recovery {
    enabled = true
  }
}
