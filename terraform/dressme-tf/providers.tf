terraform {
  required_version = ">= 1.12.2"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.38"
    }
  }

  # Terraform state is stored in an Azure Storage Account so it can be preserved
  # and shared between developers.
  # The resources required for storing the Terraform state are defined in a
  # separate Terraform module at ../dressme-tfbackend.
  backend "azurerm" {
    resource_group_name  = "dressme-tfbackend-rg"    # matches resource group name from ../dressme-tfbackend/main.tf
    storage_account_name = "dressmetfbackendstorage" # matches storage account name from ../dressme-tfbackend/main.tf
    container_name       = "tfstate"                 # matches container name from ../dressme-tfbackend/main.tf
    key                  = "terraform.tfstate"
  }
}

provider "azurerm" {
  features {}

  subscription_id = var.azure_subscription_id
}
