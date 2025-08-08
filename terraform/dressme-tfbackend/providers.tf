terraform {
  required_version = ">= 1.12.2"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.38"
    }
  }
}

provider "azurerm" {
  features {}

  subscription_id = var.azure_subscription_id
}
