resource "azurerm_resource_group" "rg" {
  name     = "dressme-api-rg"
  location = "westeurope"
}

# This file contains the resources for the backend application.

# Container registry is used to store the images for the container app
resource "azurerm_container_registry" "acr" {
  name                = "dressmeapiacr"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Basic"
  # Admin access is required to push/pull new images without using a service principal.
  # TODO: use a service principal instead
  admin_enabled                 = true
  public_network_access_enabled = true
}

# Log analytics workspace is used to store logs and metrics for the container app
resource "azurerm_log_analytics_workspace" "workspace" {
  name                = "dressme-workspace"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  retention_in_days   = 30
}

resource "azurerm_container_app_environment" "aca_env" {
  name                       = "dressme-api-aca-env"
  resource_group_name        = azurerm_resource_group.rg.name
  location                   = azurerm_resource_group.rg.location
  logs_destination           = "log-analytics"
  log_analytics_workspace_id = azurerm_log_analytics_workspace.workspace.id
}

# Azure Container App sets the secret name to this on every deploy, so we use the same value to stay
# in sync
locals {
  registry_password_secret_name = join("-", [replace(azurerm_container_registry.acr.login_server, ".", ""), azurerm_container_registry.acr.name])
}

resource "azurerm_container_app" "aca" {
  name                         = "dressme-api-aca"
  container_app_environment_id = azurerm_container_app_environment.aca_env.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  # Get the password for the registry, this must be stored in a secret
  secret {
    name  = local.registry_password_secret_name
    value = azurerm_container_registry.acr.admin_password
  }

  # Use admin credentials to push/pull images without using a service principal
  # TODO: use a service principal instead
  registry {
    server               = azurerm_container_registry.acr.login_server
    username             = azurerm_container_registry.acr.admin_username
    password_secret_name = local.registry_password_secret_name
  }

  template {
    container {
      name = "dressme-api-aca" # NOTE: must be the same as the name of the container app
      # Use a placeholder image because the API image has not been pushed to the registry when
      # first creating the resources. This image will be replaced when deploying a new version of
      # the API by following instructions in the API README.
      image = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
      # Use minimum CPU/memory
      cpu    = 0.25
      memory = "0.5Gi"

      # Environment variables
      env {
        name  = "AUTH0_ALGORITHMS"
        value = var.auth0_algorithms
      }
      env {
        name  = "AUTH0_API_AUDIENCE"
        value = var.auth0_api_audience
      }
      env {
        name  = "AUTH0_DOMAIN"
        value = var.auth0_domain
      }
      env {
        name  = "AUTH0_ISSUER"
        value = var.auth0_issuer
      }
      env {
        name  = "REPLICATE_API_TOKEN"
        value = var.replicate_api_token
      }

      # Readiness probe is required
      readiness_probe {
        path             = "/healthz"
        port             = 8000
        transport        = "HTTP"
        interval_seconds = 240 # maximum
      }
    }

    min_replicas = 0
    max_replicas = 1
  }

  # Allow external access to the container app
  ingress {
    target_port      = 8000
    external_enabled = true
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  # Ignore changes to the image because this will be changed when deploying the backend
  lifecycle {
    ignore_changes = [
      template[0].container[0].image,
    ]
  }
}
