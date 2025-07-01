# Hello AI AVS 🤖✨

A minimal [EigenLayer](https://www.eigenlayer.xyz/) AVS (Actively Validated Service) that performs **AI inference** using [Groq’s LLaMA3-70B](https://console.groq.com) to respond to onchain tasks.


## 🛠️ Tech Stack

- **Smart Contract**: Solidity (`HelloWorldServiceManager.sol`)
- **Operator**: TypeScript + Ethers.js
- **Inference**: Groq API (`llama3-70b-8192`)
- **Local Chain**: Hardhat / Anvil (Chain ID: `31337`)

---

## ⚙️ How It Works

1. Anyone calls `createNewTask("Name")` onchain.
2. Offchain operator listens for `NewTaskCreated` events.
3. Operator sends the name to LLM for a fun AI-generated response.
4. A canonical message `"Hello, {name}"` is signed and submitted.
5. Signature is verified onchain by `ECDSAStakeRegistry`.


```
## 🧪 Example Output

🎯 New task detected: LazyDog335
🤖 AI-generated message: "Hey there LazyDog335! 🐶 ..."
✅ Responded with: "Hello, LazyDog335"

```
```bash
git clone https://github.com/bansalayush247/hello_world_avs
cd hello_world_avs
cp .env.example .env         # Fill in PRIVATE_KEY and GROQ_API_KEY
npm install
````

---

## 🚀 Quick Start

### 1. Start Local Chain

In terminal #1:

```bash
npm run start:anvil
```

---

### 2. Deploy Contracts & Start Operator

In terminal #2:

```bash
cp contracts/.env.example contracts/.env

# Build and deploy
npm run build:forge
npm run deploy:core
npm run deploy:hello-world

# Optional: update ABIs
npm run extract:abis

# Start the operator
npm run start:operator
```

---

### 3. Generate Onchain Tasks

In terminal #3:

```bash
npm run start:traffic
```
