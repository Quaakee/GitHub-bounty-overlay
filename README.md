# GitHub Bounty Overlay

A BSV Overlay Service that enables developers to create and claim bounties for GitHub issues.

## Overview

This project allows:

1. **Repository owners/contributors** to create bounties for GitHub issues
2. **Developers** to claim bounties by solving issues
3. **Identity verification** using GitHub credentials

The system uses:
- BSV blockchain for secure bounty storage and payment
- Overlay Services Engine for transaction processing
- GitHub OAuth for identity verification
- GitCert certificates for linking GitHub identities to BSV keys

## Prerequisites

- Node.js v16+ and npm
- Docker and Docker Compose
- Git
- A GitHub account
- MetaNet Client (for wallet funding)

## Setup

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/github-bounty-overlay.git
cd github-bounty-overlay
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure LARS**

```bash
npm run lars:config
```

Follow the prompts to set up a server private key and configure LARS.

4. **Set up GitHub OAuth**

Create a GitHub OAuth application at https://github.com/settings/developers and set the following environment variables in your `.env` file:

```
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=http://localhost:3002/auth/github/callback
```

5. **Start the development environment**

```bash
npm run start
```

This will start LARS with both the backend and frontend.

## Creating a Bounty

1. Log in with your GitHub account.
2. Get a GitHub identity certificate.
3. Navigate to "Create Bounty" in the UI.
4. Enter the GitHub issue ID (format: "owner/repo#issue_number").
5. Enter the repository owner's GitHub username.
6. Set the bounty amount (in satoshis) and deadline.
7. Click "Create Bounty" to submit.

## Claiming a Bounty

1. Log in with your GitHub account.
2. Get a GitHub identity certificate.
3. Navigate to "View Bounties" to see available bounties.
4. Solve the GitHub issue and submit a Pull Request.
5. Click "Claim" on the bounty and enter your PR ID.
6. The backend will verify your identity and the PR, then release the funds.

## System Architecture

- **BountyContract**: sCrypt smart contract that locks funds until conditions are met.
- **BountyTopicManager**: Manages bounty transactions on the BSV blockchain.
- **BountyLookupService**: Allows querying bounties by various criteria.
- **GitHubIdentityService**: Verifies GitHub identities and manages certificates.
- **MongoDB**: Stores bounty data and GitHub identity information.

## Development

### Project Structure

```
github-bounty-overlay/
├── backend/
│   ├── src/
│   │   ├── contracts/           # sCrypt smart contracts
│   │   ├── topic-managers/      # Overlay topic managers
│   │   ├── lookup-services/     # Overlay lookup services
│   │   ├── services/            # Business logic services
│   │   └── api/                 # API routes
│   └── artifacts/               # Compiled contracts
├── frontend/
│   ├── src/                     # React frontend code
│   └── public/                  # Static assets
├── local-data/                  # LARS local data (generated)
└── deployment-info.json         # LARS configuration
```

### Testing

You can test the system locally using LARS:

```bash
npm run start
```

The UI will be available at http://localhost:5173 (or the port configured by Vite).

## License

See LICENSE.txt for details.