import { ethers } from "ethers";
import * as dotenv from "dotenv";
import OpenAI from "openai";

const fs = require("fs");
const path = require("path");
dotenv.config();

if (!Object.keys(process.env).length) {
  throw new Error("process.env object is empty");
}

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
let chainId = 31337;

const avsDeploymentData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, `../contracts/deployments/hello-world/${chainId}.json`), "utf8")
);
const coreDeploymentData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, `../contracts/deployments/core/${chainId}.json`), "utf8")
);

const delegationManagerAddress = coreDeploymentData.addresses.delegationManager;
const avsDirectoryAddress = coreDeploymentData.addresses.avsDirectory;
const helloWorldServiceManagerAddress = avsDeploymentData.addresses.helloWorldServiceManager;
const ecdsaStakeRegistryAddress = avsDeploymentData.addresses.stakeRegistry;

const delegationManagerABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../abis/IDelegationManager.json"), "utf8"));
const ecdsaRegistryABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../abis/ECDSAStakeRegistry.json"), "utf8"));
const helloWorldServiceManagerABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../abis/HelloWorldServiceManager.json"), "utf8"));
const avsDirectoryABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../abis/IAVSDirectory.json"), "utf8"));

const delegationManager = new ethers.Contract(delegationManagerAddress, delegationManagerABI, wallet);
const helloWorldServiceManager = new ethers.Contract(helloWorldServiceManagerAddress, helloWorldServiceManagerABI, wallet);
const ecdsaRegistryContract = new ethers.Contract(ecdsaStakeRegistryAddress, ecdsaRegistryABI, wallet);
const avsDirectory = new ethers.Contract(avsDirectoryAddress, avsDirectoryABI, wallet);

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY!,
  baseURL: "https://api.groq.com/openai/v1",
});

const callOpenAI = async (taskName: string, retries = 2): Promise<string> => {
  const model = "llama3-70b-8192";

  for (let i = 0; i <= retries; i++) {
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: `Greet this user in a fun, friendly way: ${taskName}` }],
      });
      return completion.choices[0].message.content || `Hello, ${taskName}`;
    } catch (err) {
      if (i === retries) {
        console.warn(`⚠️ OpenAI call failed on attempt ${i + 1}:`, err);
        return `Hello, ${taskName}`;
      }
    }
  }
  return `Hello, ${taskName}`;
};

const signAndRespondToTask = async (taskIndex: number, taskCreatedBlock: number, taskName: string) => {
  console.log(`🎯 New task detected: ${taskName}`);

  // ✅ Generate AI message for fun (just log it, don't use it for signing)
  const friendlyMessage = await callOpenAI(taskName);
  console.log(`🤖 AI-generated message: "${friendlyMessage}"`);

  // ✅ Create message exactly as on-chain expects
  const signedMessage = `Hello, ${taskName}`;
  const messageHash = ethers.solidityPackedKeccak256(["string"], [signedMessage]);
  const messageBytes = ethers.getBytes(messageHash);
  const signature = await wallet.signMessage(messageBytes);

  const operators = [await wallet.getAddress()];
  const signatures = [signature];
  const signedTask = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "bytes[]", "uint32"],
    [operators, signatures, taskCreatedBlock]
  );

  const tx = await helloWorldServiceManager.respondToTask(
    { name: taskName, taskCreatedBlock },
    taskIndex,
    signedTask
  );
  await tx.wait();

  console.log(`✅ Responded with: "${signedMessage}"`);
};

const registerOperator = async () => {
  try {
    const tx1 = await delegationManager.registerAsOperator(
      "0x0000000000000000000000000000000000000000",
      0,
      ""
    );
    await tx1.wait();
    console.log("🔗 Operator registered to Core EigenLayer contracts");
  } catch (error) {
    console.error("❌ Error in registering as operator:", error);
  }

  const salt = ethers.hexlify(ethers.randomBytes(32));
  const expiry = Math.floor(Date.now() / 1000) + 3600;

  const operatorDigestHash = await avsDirectory.calculateOperatorAVSRegistrationDigestHash(
    wallet.address,
    await helloWorldServiceManager.getAddress(),
    salt,
    expiry
  );

  console.log("✍️ Signing digest hash with operator's private key");
  const operatorSigningKey = new ethers.SigningKey(process.env.PRIVATE_KEY!);
  const operatorSignedDigestHash = operatorSigningKey.sign(operatorDigestHash);

  const operatorSignatureWithSaltAndExpiry = {
    signature: ethers.Signature.from(operatorSignedDigestHash).serialized,
    salt,
    expiry,
  };

  console.log("📥 Registering Operator to AVS Registry contract");
  const tx2 = await ecdsaRegistryContract.registerOperatorWithSignature(
    operatorSignatureWithSaltAndExpiry,
    wallet.address
  );
  await tx2.wait();
  console.log("✅ Operator registered on AVS successfully");
};

const monitorNewTasks = async () => {
  helloWorldServiceManager.on("NewTaskCreated", async (taskIndex: number, task: any) => {
    await signAndRespondToTask(taskIndex, task.taskCreatedBlock, task.name);
  });

  console.log("👂 Monitoring for new tasks...");
};

const main = async () => {
  await registerOperator();
  monitorNewTasks().catch((error) => {
    console.error("Error monitoring tasks:", error);
  });
};

main().catch((error) => {
  console.error("Error in main function:", error);
});
