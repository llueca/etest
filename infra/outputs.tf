output "url" {
  description = "Public URL of the game."
  value       = "https://${aws_cloudfront_distribution.web.domain_name}"
}

output "web_bucket" {
  description = "Bucket the SPA is synced to."
  value       = aws_s3_bucket.web.id
}

output "distribution_id" {
  description = "CloudFront distribution to invalidate after a deploy."
  value       = aws_cloudfront_distribution.web.id
}

output "region" {
  description = "Region of everything except CloudFront. The deploy script uses it for its AWS CLI calls."
  value       = var.region
}
