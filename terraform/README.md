# Terraform

We use [Terraform](https://www.terraform.io/) to deploy the cloud resources for the application. This only needs to be done when resources need to be created/changed/destroyed, i.e. when something has changed in the `.tf` files or when deploying from scratch.

The goal is to never make any changes to resources through the Azure Portal or CLI, instead letting Terraform manage everything. This is how we ensure our infrastructure is always in sync between environments and that we can easily recreate it if needed.

## Structure

This directory contains two Terraform modules:

- 📁 `dressme-tf`: the primary infrastructure for the dressme application.
- 📁 `dressme-tfbackend`: the secondary infrastructure for the Terraform backend, which stores the Terraform state of the dressme application.

## Installation

1. Install [Terraform](https://developer.hashicorp.com/terraform/install?product_intent=terraform) >= 1.12.2:

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
```

2. Install the [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli):

```bash
brew install azure-cli
```

## Deployment

### Applying Changes

When changes are made to the `.tf` files in the `dressme-tf` directory or when resources have been manually changed, follow this process to bring the resources in sync with the Terraform configuration:

1. Navigate to the directory for the application:

```bash
cd dressme-tf
```

2. Make a copy of `terraform.tfvars.example`, name it `terraform.tfvars` and fill in the missing variables.

3. Log in to the Azure CLI:

```bash
az login
```

4. Initialize Terraform:

```bash
terraform init
```

5. Create/modify/destroy resources with Terraform:

```bash
terraform apply
```

Terraform will tell then tell you which changes it wants to make and ask you to confirm.

After all resources are deployed for the first time, the Azure Container App will fail to become healthy. This is because ingress is configured on port 8000 while the placeholder image listens on port 80. This will be resolved when deploying the API as described in the [API README](../api/README.md#deployment).

### Initializing a Terraform Backend

You probably won't need to do this, but if you're deploying to a completely empty Azure subscription you'll need to create some resources to store the Terraform state. The state is how Terraform knows which resources actually exist. If the state is lost, Terraform will want to create all resources from scratch.

The Terraform backend is itself created by Terraform. However, since the backend does not exist yet, it cannot be used to store the state of the Terraform backend itself. That's why the state for the Terraform backend is only stored locally on your machine. It shouldn't be necessary to make many changes to the Terraform backend, but if you do, make sure to migrate the Terraform state of the application (i.e. the data in the storage account).

To create the resources for the Terraform backend:

1. Navigate to the directory for the Terraform backend:

```bash
cd dressme-tfbackend
```

2. Make a copy of `terraform.tfvars.example`, name it `terraform.tfvars` and fill in the missing variables.

3. Log in to the Azure CLI:

```bash
az login
```

4. Initialize Terraform:

```bash
terraform init
```

5. Create/modify/destroy resources with Terraform:

```bash
terraform apply
```

The Terraform state for the application will be stored in a storage account which is in a resource group separate from the application itself.
