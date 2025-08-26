variable "auth0_algorithms" {
  type      = string
  sensitive = true
}
variable "auth0_api_audience" {
  type = string
}
variable "auth0_domain" {
  type = string
}
variable "auth0_issuer" {
  type = string
}
variable "azure_subscription_id" {
  type = string
}
variable "database_url" {
  type      = string
  sensitive = true
}
variable "replicate_api_token" {
  type      = string
  sensitive = true
}
