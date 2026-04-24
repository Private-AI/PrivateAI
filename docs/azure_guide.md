# Azure Python SDK Guide for Automatic Provisioning

This guide is a practical setup checklist for a **fresh Azure account** that needs to use the **Azure Python SDK** for **automatic provisioning** of Azure resources.

It is based on Microsoft’s Azure Python SDK docs, especially:

- Azure SDK overview: https://learn.microsoft.com/en-us/azure/developer/python/sdk/azure-sdk-overview
- Authentication overview: https://learn.microsoft.com/en-us/azure/developer/python/sdk/authentication/overview
- Service principal auth for local development: https://learn.microsoft.com/en-us/azure/developer/python/sdk/authentication/local-development-service-principal
- Package installation: https://learn.microsoft.com/en-us/azure/developer/python/sdk/azure-sdk-install
- Resource group provisioning example: https://learn.microsoft.com/en-us/azure/developer/python/sdk/examples/azure-sdk-example-resource-group
- SDK package index: https://azure.github.io/azure-sdk-for-python/

---

## 1. What you actually need

If your goal is **automatic provisioning** from Python, you are using the **management plane** SDKs, which are the packages named like:

- `azure-mgmt-resource`
- `azure-mgmt-storage`
- `azure-mgmt-compute`
- etc.

You will also usually need:

- `azure-identity` for authentication

### Important: do you need API keys?

**Usually, no.**

Microsoft recommends using **Microsoft Entra ID token-based auth** instead of API keys or connection strings.

For provisioning, the normal setup is:

- Azure subscription
- Microsoft Entra tenant
- App registration / service principal
- RBAC role assignment
- Python code using `DefaultAzureCredential()` or `ClientSecretCredential()`

### The credentials/settings you *do* need

For a local automation script using a service principal, you typically need:

- **Azure Subscription ID**
- **Azure Tenant ID**
- **Azure Client ID**
- **Azure Client Secret**

These are not really “API keys” in the usual sense. They are **identity credentials** for Entra ID.

---

## 2. Azure account settings to enable

For a fresh Azure account, make sure the following exists and is usable:

### Required

1. **An active Azure subscription**
   - You need a subscription before provisioning anything.
   - In the Azure portal, confirm the subscription is active.

2. **A Microsoft Entra tenant**
   - This is your identity directory.
   - It is where your app registration / service principal will live.

3. **Permission to create app registrations/service principals**
   - Needed if you want your Python automation to authenticate as its own application identity.

4. **RBAC role assignments on the correct scope**
   - To provision resources, your automation identity must have sufficient permissions.
   - Common scopes:
     - subscription
     - resource group
     - specific resource

### Recommended

5. **Azure CLI access enabled for your user**
   - Makes it easier to create the service principal and inspect the account.

6. **Single-tenant app registration** unless you specifically need multi-tenant
   - Microsoft’s docs commonly use **single tenant** for this type of setup.

---

## 3. Best-practice auth choice for provisioning

Microsoft’s guidance is:

- **Use token-based auth with `azure-identity`**
- Prefer **managed identity** when code runs inside Azure
- Use a **service principal** for local development or external automation
- Avoid connection strings and keys unless a specific service requires them

### For your use case

If you want to provision Azure resources from a local machine or CI pipeline, use:

- **service principal + RBAC**
- `DefaultAzureCredential()` or `ClientSecretCredential()`

---

## 4. Step-by-step setup for a fresh Azure account

## Step 1: Create and verify the Azure account

1. Go to the Azure portal: https://portal.azure.com
2. Sign in with your Microsoft account.
3. Confirm you have an **active subscription**.
4. Open **Subscriptions** in the portal and note:
   - subscription name
   - subscription ID
5. Open **Microsoft Entra ID** and note:
   - tenant ID

You will need both later.

---

## Step 2: Install local tools

Install:

- Python 3.9+
- Azure CLI

Microsoft’s Python SDK docs state the SDK supports **Python 3.9 or later**.

### Verify Python

```bash
python3 --version
```

### Verify Azure CLI

```bash
az version
```

### Sign in

```bash
az login
```

If you have multiple subscriptions, pick the correct one:

```bash
az account list --output table
az account set --subscription "<subscription-name-or-id>"
```

Get the active subscription ID:

```bash
az account show --query id --output tsv
```

---

## Step 3: Create a dedicated service principal for automation

For automatic provisioning, this is the cleanest setup.

### Option A: Fastest method with Azure CLI

Microsoft’s docs show this command:

```bash
az ad sp create-for-rbac --name <service-principal-name>
```

Example:

```bash
az ad sp create-for-rbac --name trustgpt-provisioner
```

This returns JSON like:

```json
{
  "appId": "00000000-0000-0000-0000-000000000000",
  "displayName": "trustgpt-provisioner",
  "password": "abcdefghijklmnopqrstuvwxyz",
  "tenant": "11111111-1111-1111-1111-111111111111"
}
```

Save these values immediately:

- `appId` -> **AZURE_CLIENT_ID**
- `password` -> **AZURE_CLIENT_SECRET**
- `tenant` -> **AZURE_TENANT_ID**

**Important:** the client secret value is normally shown only once.

### Option B: Create it in the Azure portal

In the portal:

1. Open **Microsoft Entra ID**
2. Open **App registrations**
3. Click **New registration**
4. Give it a descriptive name like `trustgpt-provisioner`
5. Choose **Accounts in this organizational directory only** unless you need something else
6. Register the app
7. Copy:
   - **Application (client) ID**
   - **Directory (tenant) ID**
8. Go to **Certificates & secrets**
9. Click **New client secret**
10. Copy the generated **secret value** immediately

These become:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_SECRET`

---

## Step 4: Assign RBAC permissions

This is the most important configuration step.

Your service principal can authenticate successfully and still fail to provision resources if it has no role assignments.

### Minimum role concept

Give the service principal enough permissions at the smallest useful scope.

### Common choices

- **Contributor**: can create/manage most resources, but cannot grant access
- **Reader**: not enough for provisioning
- **Owner**: very broad; usually avoid unless you truly need it

### Practical recommendation

For most provisioning scripts:

- assign **Contributor** on a **resource group** if all resources live there
- assign **Contributor** on the **subscription** only if the script must create resource groups or manage many groups

Microsoft’s resource group example notes that if the script needs to create resource groups and storage resources, the identity needs sufficient permission; **Contributor at subscription scope** is a common practical choice for that scenario.

### Assign role with Azure CLI

List available role names:

```bash
az role definition list \
  --query "sort_by([].{roleName:roleName, description:description}, &roleName)" \
  --output table
```

Assign Contributor at subscription scope:

```bash
SUBSCRIPTION_ID=$(az account show --query id --output tsv)
SP_APP_ID="<your-client-id>"

az role assignment create \
  --assignee "$SP_APP_ID" \
  --role "Contributor" \
  --scope "/subscriptions/$SUBSCRIPTION_ID"
```

Assign Contributor at a resource group scope:

```bash
RESOURCE_GROUP="my-automation-rg"
SUBSCRIPTION_ID=$(az account show --query id --output tsv)
SP_APP_ID="<your-client-id>"

az role assignment create \
  --assignee "$SP_APP_ID" \
  --role "Contributor" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP"
```

### If the script must create role assignments too

You may also need higher privilege such as:

- **User Access Administrator**
- or **Owner**

Only grant those if your automation actually manages access control.

---

## Step 5: Create a Python environment

Microsoft recommends a normal virtual environment or conda environment.

### Using `venv`

```bash
python3 -m venv .venv
source .venv/bin/activate
```

On Windows PowerShell:

```powershell
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
```

### Windows + VS Code notes

From the additional Windows/VS Code resource you shared, these are useful practical steps:

- install the **VS Code Python extension**
- make sure the correct **Python interpreter** is selected in VS Code
- keep dependencies in a `requirements.txt`
- prefer environment variables over hardcoded IDs/secrets

A simple `requirements.txt` for provisioning can start with:

```txt
azure-identity
azure-mgmt-resource
azure-mgmt-subscription
```

Then install it with:

```bash
pip install -r requirements.txt
```

---

## Step 6: Install the Azure Python SDK packages

For provisioning, install:

```bash
pip install azure-identity azure-mgmt-resource
```

Then add service-specific management packages as needed, for example:

```bash
pip install azure-mgmt-storage
pip install azure-mgmt-compute
pip install azure-mgmt-network
```

### Package naming rule from the docs

- **Management plane** packages start with `azure-mgmt-`
- **Client/data plane** packages usually start with `azure-`

Examples:

- `azure-mgmt-resource` -> create/manage resources
- `azure-storage-blob` -> use Blob Storage data plane
- `azure-identity` -> auth

---

## Step 7: Set the environment variables

For service principal auth, Microsoft’s docs show these variables:

```bash
export AZURE_CLIENT_ID="<your-client-id>"
export AZURE_TENANT_ID="<your-tenant-id>"
export AZURE_CLIENT_SECRET="<your-client-secret>"
export AZURE_SUBSCRIPTION_ID="<your-subscription-id>"
```

You will often also set convenience values for scripts:

```bash
export AZURE_RESOURCE_GROUP_NAME="trustgpt-dev-rg"
export LOCATION="australiaeast"
```

### `.env` example

```env
AZURE_CLIENT_ID=<your-client-id>
AZURE_TENANT_ID=<your-tenant-id>
AZURE_CLIENT_SECRET=<your-client-secret>
AZURE_SUBSCRIPTION_ID=<your-subscription-id>
AZURE_RESOURCE_GROUP_NAME=trustgpt-dev-rg
LOCATION=australiaeast
```

If using `.env`, install:

```bash
pip install python-dotenv
```

---

## Step 8: Use the correct credential in Python

### Best default choice

Use `DefaultAzureCredential()` when possible.

Why:

- it works with environment variables
- it also works later with managed identity when you deploy into Azure
- it matches Microsoft’s recommended flow

### Example: create a resource group

```python
import os
from azure.identity import DefaultAzureCredential
from azure.mgmt.resource import ResourceManagementClient

credential = DefaultAzureCredential()
subscription_id = os.environ["AZURE_SUBSCRIPTION_ID"]
resource_group_name = os.environ["AZURE_RESOURCE_GROUP_NAME"]
location = os.environ["LOCATION"]

resource_client = ResourceManagementClient(credential, subscription_id)

result = resource_client.resource_groups.create_or_update(
    resource_group_name,
    {"location": location}
)

print(f"Provisioned resource group {result.name} in {result.location}")
```

### Explicit service principal credential example

If you want to be explicit instead of relying on the default chain:

```python
import os
from azure.identity import ClientSecretCredential
from azure.mgmt.resource import ResourceManagementClient

tenant_id = os.environ["AZURE_TENANT_ID"]
client_id = os.environ["AZURE_CLIENT_ID"]
client_secret = os.environ["AZURE_CLIENT_SECRET"]
subscription_id = os.environ["AZURE_SUBSCRIPTION_ID"]

credential = ClientSecretCredential(tenant_id, client_id, client_secret)
resource_client = ResourceManagementClient(credential, subscription_id)

result = resource_client.resource_groups.create_or_update(
    "trustgpt-dev-rg",
    {"location": "australiaeast"}
)

print(result.name)
```

---

## Step 9: Verify the setup works

Run a quick test script.

If it works, you have successfully configured the account for Python SDK provisioning.

### Common verification steps

Check the active account and subscription:

```bash
az account show --output json
```

Check the resource group exists:

```bash
az group show -n "$AZURE_RESOURCE_GROUP_NAME"
```

Or view it in the Azure portal under **Resource groups**.

---

## Step 10: What you need for specific services

If you later provision more services, you add the relevant management library.

Examples:

- Resource groups: `azure-mgmt-resource`
- Storage accounts: `azure-mgmt-storage`
- VMs: `azure-mgmt-compute`
- Networking: `azure-mgmt-network`

If you also want to **use** the provisioned resources, you often add data-plane libraries too.

Example:

- Provision storage account with `azure-mgmt-storage`
- Upload blobs with `azure-storage-blob`

That is why the docs distinguish:

- **management libraries** = create/manage Azure resources
- **client libraries** = interact with the resource’s data or service API

---

## 11. Do you need API keys later?

Sometimes, yes, but not for the provisioning identity itself.

### Usually not needed for provisioning

For automatic provisioning, use:

- Tenant ID
- Client ID
- Client Secret
- Subscription ID
- RBAC role assignments

### Sometimes needed for service-specific usage

Some Azure services also expose:

- connection strings
- account keys
- endpoint keys

Examples include:

- Storage account keys
- Cognitive Services keys
- some OpenAI or AI service keys depending on auth mode

Those are **service access secrets**, not the basic Azure SDK provisioning setup.

For infrastructure automation, prefer **Entra ID auth** wherever the service supports it.

---

## 12. Recommended minimal setup summary

If you want the shortest working path, do this:

1. Create Azure account and confirm subscription
2. Install Azure CLI and Python 3.9+
3. Run `az login`
4. Run `az ad sp create-for-rbac --name trustgpt-provisioner`
5. Save:
   - `appId`
   - `password`
   - `tenant`
6. Get subscription ID with:
   - `az account show --query id --output tsv`
7. Assign **Contributor** role on the needed scope
8. Export:
   - `AZURE_CLIENT_ID`
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_SECRET`
   - `AZURE_SUBSCRIPTION_ID`
9. Install:
   - `pip install azure-identity azure-mgmt-resource`
10. Use `DefaultAzureCredential()` in Python
11. Create a resource group as the smoke test

---

## 13. Common mistakes

### 1. Confusing API keys with Azure identity credentials
For provisioning, you usually do **not** want a service API key. You want a **service principal**.

### 2. Forgetting RBAC
Authentication may succeed, but provisioning fails with authorization errors.

### 3. Missing `AZURE_SUBSCRIPTION_ID`
Management clients need the subscription ID.

### 4. Using the wrong package type
- provisioning -> `azure-mgmt-*`
- data usage -> service client package like `azure-storage-blob`

### 5. Not saving the client secret immediately
Azure often only shows it once.

### 6. Granting too much access
Prefer least privilege. Use resource-group scope where possible.

---

## 14. Final answer to “what settings do I enable and what keys do I need?”

### Enable / configure

- Active Azure subscription
- Microsoft Entra tenant
- App registration / service principal
- RBAC role assignment for that service principal
- Azure CLI login locally
- Python 3.9+ environment
- Required Azure SDK packages

### Values/secrets you need

- `AZURE_SUBSCRIPTION_ID`
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

### API keys?

- **Not usually for provisioning**
- Only for some specific Azure services if you later choose a key-based auth mode

---

## 15. Best next step

After finishing the setup, run the resource group provisioning example first. If that works, your Azure account is correctly configured for Python-based infrastructure automation.
