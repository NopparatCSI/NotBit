# MetaMask domain review — draft, not submitted

Observed 19 November 2026 in official MetaMask Extension 13.57.0, in an isolated Chromium profile. The only imported wallet is an existing Sepolia acceptance account. No connection was approved and no signature or transaction was confirmed in the extension.

Flagged URL: `https://notbit-7n2v2lrq5-nopparatcsis-projects.vercel.app`

MetaMask displayed **Malicious—flagged as unsafe** on the connection request, followed by a warning about phishing or wallet-draining activity. This report requests investigation; it does not assert that the classification is a false positive.

The deployment was built from repository commit `641c58740cd43b21a27621bbe5ac9bda8d882aab`. The application is a Sepolia testnet game-item escrow demo, with Cloud Supabase Web3 sign-in. The first wallet request is account access followed by chain selection and an EIP-4361 sign-in message. Source inspection found no third-party script tags; application wallet calls use wagmi/viem. This limited inspection is not a security audit or proof that the domain is safe.

The newly deployed escrow is `0x560510dc7d96512f6b4f94932ca717e612ba80ac`, chain `11155111`. Sourcify reports `exact_match` for the 16 submitted source files. Deployment transaction: `0x834f3728d10c5370cefbe9ad3710e38f9f3710409a4b2b072757d139783d7074`.

Screenshot retained locally at `.runtime/release/metamask-preview-warning.png`. Never attach the browser profile, environment files, state logs, wallet key files, or authentication cookies to a report.

MetaMask directs URL classification concerns to Support for manual review: [security-alert guidance](https://support.metamask.com/configure/wallet/security-alerts#how-to-report-a-false-classification). Include the flagged URL, network, screenshot and [block-explorer deployment](https://sepolia.etherscan.io/address/0x560510dc7d96512f6b4f94932ca717e612ba80ac). Send only after the project owner explicitly authorizes the external support submission. Keep item 25 and the main merge gate open until the alert is resolved and actual MetaMask acceptance is repeated.

The stable Preview alias `https://notbit-preview-nopparatcsi.vercel.app` was created for repeat deployments and Cron configuration. Its existence does not resolve the alert on the original URL. Do not change domains or disable security alerts as a way to mark wallet acceptance passed.
