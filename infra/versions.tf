terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }

  # Partial configuration: supply bucket/key/region with
  #   terraform init -backend-config=backend.hcl   (see backend.hcl.example)
  backend "s3" {}
}

provider "aws" {
  region = var.region
}
