# OS Code Signing & Notarization Guide

This document describes how to configure and execute signed and notarized production builds for macOS and Windows using **electron-builder**.

---

## 🍎 macOS Signing & Notarization

macOS requires apps to be code-signed with a valid **Developer ID Application** certificate and **Notarized** by Apple's notary service to prevent the "App is from an unidentified developer" Gatekeeper alert on startup.

### 1. Requirements
- An active Apple Developer Account ($99/year).
- macOS device with Xcode installed.
- A **Developer ID Application** Certificate (downloaded from Apple Developer Portal and imported into Keychain Access).

### 2. Required Environment Variables
For CI/CD or local release builds, configure the following variables in your environment or a secure `.env` file (ensure it is gitignored!):

```bash
# Keychain certificate password (usually only needed in headless environments)
# CSC_LINK: Base64 representation of your certificate (.p12) or Keychain path
# CSC_KEY_PASSWORD: password to decrypt the certificate (.p12) file

# Apple ID notarization credentials:
APPLE_ID="your-apple-id@email.com"
APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
APPLE_TEAM_ID="ABC123XYZ4"
```

### 3. Configuring `electron-builder.yml`
Ensure your configuration implements the hardened runtime and includes the notarize payload:

```yaml
mac:
  category: public.app-category.utilities
  target:
    - dmg
    - zip
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  # Notarization configuration (electron-builder automatically notarizes if variables are present)
  notarize:
    teamId: "ABC123XYZ4"
```

---

## 🪟 Windows Code Signing

Windows requires a code-signing certificate (typically an **Authenticode** certificate) to bypass the **Windows SmartScreen** filter.

### 1. Requirements
- An EV (Extended Validation) or Standard Code Signing Certificate from a trusted Certificate Authority (e.g. Sectigo, DigiCert).
- Typically delivered as a `.pfx` or `.p12` file (or a hardware token/USB for EV certificates).

### 2. Required Environment Variables
Configure the following env vars in your build terminal:

```bash
# Path to your .pfx certificate file
WIN_CSC_LINK="C:\\path\\to\\certificate.pfx"
# Password for the .pfx file
WIN_CSC_KEY_PASSWORD="your-certificate-password"
```

### 3. Configuring `electron-builder.yml`
Configure the signing subject and signing algorithm:

```yaml
win:
  target:
    - nsis
  publisherName: "Your Company/Developer Name"
  # electron-builder will use signtool.exe automatically to sign the executable
```

---

## 🚀 Running the Release Build

Once environment variables are set and Keychain/certificates are ready, run:

```bash
# Build & Package for macOS (on macOS)
npm run build:mac

# Build & Package for Windows
npm run build:win
```
