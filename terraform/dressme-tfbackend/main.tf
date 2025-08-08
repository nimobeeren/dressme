resource "azurerm_resource_group" "rg" {
  name     = "dressme-tfbackend-rg"
  location = "westeurope"
}

resource "azurerm_storage_account" "sa" {
  name                     = "dressmetfbackendstorage"
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

resource "azurerm_storage_container" "tfstate" {
  name                  = "tfstate"
  storage_account_id    = azurerm_storage_account.sa.id
  container_access_type = "private"
}
