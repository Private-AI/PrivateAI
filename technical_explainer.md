# Azure Infrastructure Provisioning: Technical Explainer

## Table of Contents
1. [What This System Does](#what-this-system-does)
2. [Cloud Provisioning Concepts for Beginners](#cloud-provisioning-concepts-for-beginners)
3. [Azure Services Overview](#azure-services-overview)
4. [System Architecture](#system-architecture)
5. [Code Structure and Implementation](#code-structure-and-implementation)
6. [The Complete Provisioning Workflow](#the-complete-provisioning-workflow)
7. [Security Implementation](#security-implementation)
8. [Cost Management](#cost-management)
9. [Testing Strategy](#testing-strategy)
10. [Troubleshooting](#troubleshooting)

---

## What This System Does

This codebase is a **Python-based Azure infrastructure provisioning system** that automatically creates and manages high-performance virtual machines (VMs) in Microsoft Azure cloud. Specifically, it:

- **Deploys H100 GPU-powered VMs** for running AI models (specifically Ollama AI models)
- **Implements Confidential Computing** with hardware-level security features
- **Manages the complete lifecycle** from creation to deletion
- **Automates software installation** including NVIDIA drivers and AI frameworks
- **Provides cost-aware operations** with built-in warnings and auto-shutdown

Think of it as a "smart robot" that can create, configure, and manage powerful computers in the cloud with just a few commands.

---

## Cloud Provisioning Concepts for Beginners

### What is Cloud Provisioning?

**Cloud provisioning** is the process of automatically creating and configuring computing resources (like servers, networks, storage) in the cloud using code instead of manual setup through web interfaces.

```
Traditional Way (Manual):           Modern Way (Automated):
┌─────────────────────┐            ┌─────────────────────┐
│ 1. Login to portal  │            │ 1. Run one command  │
│ 2. Click "Create VM"│     VS     │    azure-setup      │
│ 3. Fill 20+ forms   │            │    deploy           │
│ 4. Wait & monitor   │            │ 2. Everything done  │
│ 5. Manually install │            │    automatically    │
│ 6. Configure apps   │            │                     │
└─────────────────────┘            └─────────────────────┘
```

### Key Cloud Concepts

**Infrastructure as Code (IaC)**: Writing code that describes what infrastructure you want, then letting the computer create it for you.

**Resource Groups**: Containers that hold related cloud resources together (like a folder for organizing files).

**Virtual Networks**: Private networks in the cloud where your resources can communicate securely.

**Security Groups**: Virtual firewalls that control who can access your resources and how.

### Azure SDK vs. CLI

This system uses the **Azure Python SDK** instead of command-line tools:

```python
# Azure SDK (What this system uses)
vm_params = VirtualMachine(
    location="eastus",
    hardware_profile=HardwareProfile(vm_size="Standard_NCC40ads_H100_v5"),
    # ... detailed configuration in Python objects
)
vm_result = compute_client.virtual_machines.begin_create_or_update(
    resource_group, vm_name, vm_params
)

# vs. Azure CLI (Traditional approach)
# az vm create --resource-group myRG --name myVM --size Standard_NCC40ads_H100_v5 ...
```

**Benefits of SDK approach:**
- **Type Safety**: Python catches errors before they happen
- **Better Error Handling**: Detailed error messages and recovery
- **Programmatic Control**: Can make decisions based on current state
- **Integration**: Works seamlessly with Python applications

---

## Azure Services Overview

This system orchestrates multiple Azure services to create a complete AI-ready environment:

```
Azure Services Used:
┌─────────────────────────────────────────────────────────────┐
│                    Resource Group                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                Virtual Network (VNet)               │   │
│  │  ┌─────────────────┐  ┌─────────────────────────┐   │   │
│  │  │     Subnet      │  │ Network Security Group │   │   │
│  │  │  10.0.0.0/24   │  │    (Firewall Rules)    │   │   │
│  │  └─────────────────┘  └─────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │   Public IP     │  │        Virtual Machine         │   │
│  │   (Static)      │  │   H100 GPU + Confidential VM   │   │
│  └─────────────────┘  └─────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │ Network Interface│  │         Storage Disks          │   │
│  │   (Connects VM   │  │  OS Disk (256GB) + Data (1TB)  │   │
│  │   to network)    │  │                                │   │
│  └─────────────────┘  └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Core Services Explained

**1. Resource Group**: Think of this as a project folder that contains all related resources.
```python
# From deployer.py:205
resource_client.resource_groups.create_or_update(
    config.resource_group,
    {
        "location": config.location,
        "tags": {"project": "h100-ollama", "created-by": "azure-setup-python"},
    },
)
```

**2. Network Security Group (NSG)**: A virtual firewall that controls network traffic.
```python
# From deployer.py:218-244
nsg_params = NetworkSecurityGroup(
    location=config.location,
    security_rules=[
        SecurityRule(
            name="AllowSSH",
            priority=1000,
            protocol=SecurityRuleProtocol.TCP,
            access=SecurityRuleAccess.ALLOW,
            direction=SecurityRuleDirection.INBOUND,
            source_address_prefix="*",  # Can be restricted to specific IPs
            destination_port_range="22", # SSH port
        ),
        SecurityRule(
            name="AllowOllama",
            priority=1010,
            protocol=SecurityRuleProtocol.TCP,
            destination_port_range="11434", # Ollama API port
        ),
    ],
)
```

**3. Virtual Network (VNet)**: Creates a private network in Azure.
```python
# From deployer.py:255-268
vnet_params = VirtualNetwork(
    location=config.location,
    address_space=AddressSpace(address_prefixes=["10.0.0.0/16"]), # Private IP range
    subnets=[
        Subnet(
            name=config.subnet_name,
            address_prefix="10.0.0.0/24", # Subnet within the VNet
            network_security_group=nsg_result, # Attach firewall
        ),
    ],
)
```

**4. Virtual Machine**: The actual computer with H100 GPU.
```python
# From deployer.py:351-384
vm_params = VirtualMachine(
    location=config.location,
    hardware_profile=HardwareProfile(vm_size="Standard_NCC40ads_H100_v5"), # H100 GPU
    storage_profile=StorageProfile(
        image_reference=_parse_image_reference(config.image), # Ubuntu Confidential VM
        os_disk=OSDisk(
            create_option="FromImage",
            disk_size_gb=256, # OS disk size
        ),
    ),
    security_profile=security_profile, # Confidential VM security
)
```

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           User Interaction Layer                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  CLI Commands   │  │  Rich Console   │  │    Progress Tracking    │  │
│  │  (Typer)        │  │  Output         │  │                         │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
           │                        │                        │
           ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Application Logic Layer                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │   Deployer      │  │   VM Setup      │  │   Cost Management       │  │
│  │   (Infrastructure│  │   (Software)    │  │   (Lifecycle)           │  │
│  │    Creation)    │  │                 │  │                         │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
           │                        │                        │
           ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Integration Layer                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  Azure SDK      │  │  SSH (Paramiko) │  │  Configuration          │  │
│  │  - Compute      │  │  - Remote Exec  │  │  (Pydantic)             │  │
│  │  - Network      │  │  - File Transfer│  │                         │  │
│  │  - Resource     │  │                 │  │                         │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
           │                        │                        │
           ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            Azure Cloud                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ Infrastructure  │  │ Virtual Machine │  │  Storage & Networking   │  │
│  │ Resources       │  │ (H100 GPU)      │  │                         │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Command Flow:
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ azure-setup │───▶│ CLI Parser  │───▶│ Config      │───▶│ Azure SDK   │
│ deploy      │    │ (Typer)     │    │ Validation  │    │ Calls       │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                             │                     │
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Progress    │◀───│ Callbacks   │◀───│ Deployer    │◀───│ Azure       │
│ Display     │    │             │    │ Logic       │    │ Response    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

---

## Code Structure and Implementation

### Project Structure

```
src/azure_setup/
├── cli.py              # Command-line interface (entry point)
├── deployer.py         # Infrastructure provisioning (Azure SDK)
├── vm_setup.py         # Remote VM configuration (SSH)
├── cost_management.py  # VM lifecycle management
├── validator.py        # Post-deployment validation
├── auth.py             # Azure authentication
└── config.py           # Type-safe configuration
```

### Configuration Management

The system uses **Pydantic** for type-safe configuration with environment variable overrides:

```python
# From config.py:9-48
class AzureVMConfig(BaseSettings):
    """Configuration for Azure H100 Confidential VM deployment."""
    
    model_config = {"env_prefix": "AZURE_", "populate_by_name": True}
    
    # Core settings with defaults
    location: str = Field(default="eastus", description="Azure region")
    resource_group: str = Field(default="h100-conf-rg", validation_alias="AZURE_RG")
    vm_size: str = Field(default="Standard_NCC40ads_H100_v5")
    
    # Security settings
    security_type: str = Field(default="ConfidentialVM")
    disk_encryption: str = Field(default="VMGuestStateOnly")
    secure_boot: bool = Field(default=True)
    vtpm: bool = Field(default=True)
```

**Key Features:**
- **Environment Variable Override**: `AZURE_LOCATION=westus3` overrides default
- **Type Validation**: Ensures values are correct types
- **Computed Properties**: Derive resource names automatically
- **Multiple Configs**: Production vs. testing configurations

### Authentication System

```python
# From auth.py
def get_credential() -> AzureCliCredential | DefaultAzureCredential:
    """Get Azure credential, preferring Azure CLI."""
    try:
        # Try Azure CLI first (most common for developers)
        credential = AzureCliCredential()
        credential.get_token("https://management.azure.com/.default")
        return credential
    except Exception:
        # Fallback to other methods (service principal, managed identity, etc.)
        return DefaultAzureCredential()
```

**Authentication Methods (in order of preference):**
1. **Azure CLI**: `az login` (for developers)
2. **Service Principal**: Environment variables (for CI/CD)
3. **Managed Identity**: Automatic (when running on Azure)
4. **Visual Studio**: IDE integration

---

## The Complete Provisioning Workflow

### Phase 1: Infrastructure Deployment

The `deploy` command creates all Azure infrastructure:

```python
# From deployer.py:160-442
def deploy(config: AzureVMConfig, credential, subscription_id) -> DeployResult:
    """Deploy all Azure infrastructure in sequence."""
    
    # Step 1: Create Resource Group
    resource_client.resource_groups.create_or_update(
        config.resource_group,
        {"location": config.location, "tags": {...}}
    )
    
    # Step 2: Create Network Security Group (Firewall)
    nsg_params = NetworkSecurityGroup(
        security_rules=[
            SecurityRule(name="AllowSSH", destination_port_range="22"),
            SecurityRule(name="AllowOllama", destination_port_range="11434"),
        ]
    )
    
    # Step 3: Create Virtual Network + Subnet
    vnet_params = VirtualNetwork(
        address_space=AddressSpace(address_prefixes=["10.0.0.0/16"]),
        subnets=[Subnet(address_prefix="10.0.0.0/24")]
    )
    
    # Step 4: Create Public IP Address
    pip_params = PublicIPAddress(
        sku={"name": "Standard"},
        public_ip_allocation_method="Static"
    )
    
    # Step 5: Create Network Interface
    nic_params = NetworkInterface(
        ip_configurations=[NetworkInterfaceIPConfiguration(
            subnet=subnet_info,
            public_ip_address=pip_result
        )],
        enable_accelerated_networking=True  # For high performance
    )
    
    # Step 6: Create Virtual Machine
    vm_params = VirtualMachine(
        hardware_profile=HardwareProfile(vm_size="Standard_NCC40ads_H100_v5"),
        storage_profile=StorageProfile(...),
        os_profile=OSProfile(...),
        network_profile=NetworkProfile(...),
        security_profile=SecurityProfile(...)  # Confidential VM features
    )
    
    # Step 7: Attach Data Disk
    data_disk = DataDisk(
        disk_size_gb=1024,
        create_option=DiskCreateOptionTypes.EMPTY
    )
```

### Phase 2: Software Installation

The `setup-vm` command configures the VM remotely via SSH:

```python
# From vm_setup.py:25-47
class SetupStep(StrEnum):
    CONNECT = "connect"           # SSH connection
    UPDATE_SYSTEM = "update_system"      # apt update && apt upgrade
    MOUNT_DISK = "mount_disk"     # Format and mount data disk
    NVIDIA_DRIVER = "nvidia_driver"      # Install H100 drivers
    INSTALL_OLLAMA = "install_ollama"    # Install Ollama AI framework
    PULL_MODELS = "pull_models"   # Download AI models
    DONE = "done"
```

**Detailed Software Setup Process:**

```python
# 1. System Updates
def _update_system(client: paramiko.SSHClient) -> tuple[int, str]:
    """Update system packages for security and compatibility."""
    commands = [
        "sudo apt-get update -y",
        "sudo apt-get upgrade -y", 
        "sudo apt-get install -y wget curl software-properties-common"
    ]
    
# 2. Disk Mounting
def _mount_data_disk(client: paramiko.SSHClient) -> tuple[int, str]:
    """Format and mount the 1TB data disk for AI models."""
    commands = [
        "sudo parted /dev/sdc mklabel gpt",          # Initialize disk
        "sudo parted /dev/sdc mkpart primary ext4 0% 100%",  # Create partition
        "sudo mkfs.ext4 /dev/sdc1",                  # Format as ext4
        "sudo mkdir -p /models",                     # Create mount point
        "sudo mount /dev/sdc1 /models",              # Mount disk
        "echo '/dev/sdc1 /models ext4 defaults 0 0' | sudo tee -a /etc/fstab"  # Permanent mount
    ]

# 3. NVIDIA Driver Installation
def _install_nvidia_driver(client: paramiko.SSHClient) -> tuple[int, str]:
    """Install NVIDIA drivers for H100 GPU."""
    commands = [
        "wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.0-1_all.deb",
        "sudo dpkg -i cuda-keyring_1.0-1_all.deb",
        "sudo apt-get update",
        "sudo apt-get install -y cuda-drivers",      # Latest drivers
        "sudo nvidia-smi"                            # Verify installation
    ]

# 4. Ollama Installation
def _install_ollama(client: paramiko.SSHClient) -> tuple[int, str]:
    """Install and configure Ollama AI framework."""
    commands = [
        "curl -fsSL https://ollama.ai/install.sh | sh",  # Install Ollama
        "sudo systemctl enable ollama",              # Enable auto-start
        "sudo systemctl start ollama",               # Start service
        "export OLLAMA_MODELS=/models",              # Use data disk for models
    ]
```

### Phase 3: Validation

The system validates everything works correctly:

```python
# From validator.py
def validate_deployment(ip: str, ssh_key_path: str, check_gpu: bool = False) -> ValidationResult:
    """Comprehensive post-deployment validation."""
    
    checks = [
        ("SSH Connection", _check_ssh_connection),
        ("Disk Mount", _check_disk_mount),
        ("Ollama Service", _check_ollama_service),
    ]
    
    if check_gpu:
        checks.append(("GPU Detection", _check_gpu_status))
        checks.append(("Ollama API", _check_ollama_api))
    
    results = []
    for name, check_func in checks:
        success, message = check_func(client)
        results.append(ValidationCheck(name=name, passed=success, message=message))
    
    return ValidationResult(checks=results, overall_success=all(c.passed for c in results))
```

---

## Security Implementation

### Confidential Computing

This system implements **Azure Confidential Computing** with hardware-level security:

```python
# From deployer.py:330-350
if config.security_type == "ConfidentialVM":
    security_profile = SecurityProfile(
        security_type="ConfidentialVM",
        uefi_settings=UefiSettings(
            secure_boot_enabled=True,      # Cryptographically verify bootloader
            v_tpm_enabled=True,            # Virtual Trusted Platform Module
        ),
    )
    # Encrypt VM memory and disk at hardware level
    os_disk_managed["security_profile"] = {
        "security_encryption_type": "VMGuestStateOnly",  # Memory encryption
    }
```

**Security Features:**

1. **Memory Encryption**: VM memory encrypted in hardware (AMD SEV-SNP)
2. **Secure Boot**: Cryptographically signed bootloader prevents tampering
3. **vTPM**: Virtual hardware security module for key storage
4. **Disk Encryption**: All data encrypted at rest

### Network Security

```python
# Network Security Group rules restrict access
SecurityRule(
    name="AllowSSH",
    priority=1000,
    source_address_prefix="*",  # WARNING: Should be restricted in production
    destination_port_range="22",
    access=SecurityRuleAccess.ALLOW
)
```

**Security Best Practices:**
- **Restrict SSH access**: Change `source_address_prefix` from `"*"` to your IP
- **Use SSH keys**: Password authentication is disabled
- **Firewall rules**: Only necessary ports (22, 11434) are open
- **Regular updates**: System packages updated during setup

### SSH Key Management

```python
# From deployer.py:106-136
def _read_ssh_public_key(path: str) -> str:
    """Read SSH public key, generating if needed."""
    if not key_exists:
        console.print("SSH key not found, generating...")
        subprocess.run([
            "ssh-keygen", "-t", "ed25519",  # Modern, secure key type
            "-f", str(private_path),
            "-N", "",                       # No passphrase for automation
            "-C", "azure-h100"              # Comment for identification
        ])
```

---

## Cost Management

### Cost Awareness

The system includes built-in cost awareness:

```python
# H100 VMs are expensive - warn users
console.print("[red]WARNING: H100 VMs cost ~$35/hour (~$25,000/month)[/]")
console.print("[yellow]Use 'azure-setup stop' to deallocate when not in use[/]")
```

**Cost Breakdown:**
- **H100 VM**: ~$35/hour (~$25,000/month if left running)
- **Storage**: ~$100/month for disks
- **Network**: ~$10/month for data transfer
- **Test VM**: ~$0.10/hour (~$75/month)

### Lifecycle Management

```python
# From cost_management.py
def stop_vm(config: AzureVMConfig, credential, subscription_id) -> bool:
    """Stop (deallocate) VM to avoid compute charges."""
    compute_client = ComputeManagementClient(credential, subscription_id)
    
    # Deallocate stops billing for compute (but keeps disks)
    poller = compute_client.virtual_machines.begin_deallocate(
        config.resource_group, config.vm_name
    )
    poller.result(timeout=300)
    return True

def start_vm(config: AzureVMConfig, credential, subscription_id) -> bool:
    """Start a previously stopped VM."""
    poller = compute_client.virtual_machines.begin_start(
        config.resource_group, config.vm_name
    )
    poller.result(timeout=300)
    return True
```

### Auto-Shutdown

```python
def schedule_autoshutdown(config: AzureVMConfig, shutdown_time: str = "23:00") -> bool:
    """Schedule daily VM shutdown to prevent runaway costs."""
    # Uses Azure DevTest Labs auto-shutdown feature
    # Automatically stops VM at specified time every day
```

---

## Testing Strategy

The system implements a sophisticated 5-phase testing strategy to minimize costs while ensuring reliability:

### Phase 1: Static Analysis (Free)
```bash
# Run linting, type checking, import validation
ruff check src/                    # Code style and errors
mypy src/                         # Type checking
python -m py_compile src/**/*.py  # Import validation
```

### Phase 2: Dry-Run Testing (Free)
```python
# From deployer.py:444-489
def _dry_run(config: AzureVMConfig, result: DeployResult, progress) -> DeployResult:
    """Simulate deployment without making actual API calls."""
    steps = [
        (DeployStep.RESOURCE_GROUP, "az group create --name h100-conf-rg --location eastus"),
        (DeployStep.NSG, "NetworkSecurityGroup(h100-conf-rg-nsg) with SSH:22, Ollama:11434"),
        (DeployStep.VM, "VirtualMachine(h100-ollama) size=Standard_NCC40ads_H100_v5"),
    ]
    
    for step, description in steps:
        progress(step, i, total, f"[yellow][DRY-RUN][/] {description}")
        result.dry_run_log.append(description)
```

### Phase 3: Cheap Integration Testing (~$0.10/hour)
```python
# From config.py:89-103
class CheapTestConfig(AzureVMConfig):
    """Override defaults for cheap testing."""
    vm_size: str = Field(default="Standard_D2s_v5")      # $0.10/hr vs $35/hr
    image: str = Field(default="Ubuntu2204")             # Standard vs Confidential VM
    os_disk_size_gb: int = Field(default=64)             # Smaller disks
    security_type: str = Field(default="TrustedLaunch")  # Less expensive security
```

### Phase 4: Remote Validation (Free with existing VM)
```python
# Test software installation and configuration without creating new infrastructure
azure-setup validate --ip 20.1.2.3 --gpu
```

### Phase 5: Full H100 Testing (~$35/hour)
```python
# Complete end-to-end test with production configuration
azure-setup deploy                    # Full H100 deployment
azure-setup setup-vm --ip <IP>        # Install software
azure-setup validate --ip <IP> --gpu  # Comprehensive validation
azure-setup nuke --yes                # Clean up immediately
```

---

## Troubleshooting

### Common Issues and Solutions

**1. Quota Exceeded**
```python
# From deployer.py:138-157
def check_quota(compute_client, config) -> tuple[bool, int, int]:
    """Check H100 GPU quota before deployment."""
    usages = compute_client.usage.list(config.location)
    for usage in usages:
        if "NCCadsH100v5" in usage.name.localized_value:
            available = usage.limit - usage.current_value
            return available > 0, available, usage.limit
    return False, 0, 0

# Solution: Request quota increase or use different region
```

**2. SSH Connection Failed**
```python
# Check network connectivity and security groups
def _check_ssh_connection(ip: str, ssh_key_path: str) -> tuple[bool, str]:
    try:
        client = paramiko.SSHClient()
        client.connect(
            hostname=ip,
            username="azureuser", 
            key_filename=ssh_key_path,
            timeout=30
        )
        return True, "SSH connection successful"
    except Exception as e:
        return False, f"SSH failed: {e}"
```

**3. NVIDIA Driver Installation Failed**
```bash
# Check GPU detection and driver compatibility
sudo lshw -C display                   # Verify GPU is detected
sudo ubuntu-drivers devices           # Check recommended drivers
sudo apt-get purge nvidia-*           # Clean install if needed
```

**4. Cost Runaway Prevention**
```bash
# Always monitor running resources
azure-setup status                    # Check VM power state
azure-setup stop                      # Stop VM to prevent charges
az group delete --name h100-conf-rg   # Delete everything (careful!)
```

### Error Handling Patterns

The system implements comprehensive error handling:

```python
# From deployer.py:434-441
except Exception as e:
    import traceback
    result.error = str(e)
    tb = traceback.format_exc()
    console.print(f"[red]Error at step {result.step_reached.value}: {e}[/]")
    console.print(f"[dim]{tb}[/]")
    return result  # Always return a result object, never crash
```

**Error Recovery Strategies:**
- **Partial deployments**: Can resume from where it failed
- **Resource cleanup**: Automatic cleanup on critical failures
- **Detailed logging**: Full stack traces for debugging
- **Graceful degradation**: Continue with warnings when possible

---

## Summary

This Azure provisioning system represents a production-ready solution for deploying AI workloads with:

- **Enterprise-grade security** with Confidential Computing
- **Cost-aware operations** with built-in warnings and testing phases
- **Type-safe configuration** using modern Python practices
- **Comprehensive error handling** and recovery mechanisms
- **Automated software installation** for complete end-to-end setup

The system abstracts away the complexity of Azure infrastructure while providing full control and visibility into the provisioning process. Whether you're a developer learning cloud provisioning or an enterprise deploying AI workloads, this codebase demonstrates best practices for Infrastructure as Code using the Azure Python SDK.

**Key Commands to Remember:**
```bash
azure-setup deploy                # Create infrastructure
azure-setup setup-vm --ip <IP>    # Install software
azure-setup validate --ip <IP>    # Verify everything works
azure-setup stop                  # Save money when not using
azure-setup nuke --yes           # Delete everything
```