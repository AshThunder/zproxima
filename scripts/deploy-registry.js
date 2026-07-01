import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Reliable Sepolia RPC endpoints
const RPC_ENDPOINTS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://rpc.ankr.com/eth_sepolia',
  'https://cloudflare-eth.com/v1/sepolia'
];

// Import resolver for solc
function findImports(importPath) {
  try {
    let fullPath;
    if (importPath.startsWith('@openzeppelin/')) {
      fullPath = path.resolve(__dirname, '../node_modules', importPath);
    } else {
      fullPath = path.resolve(__dirname, '../contracts', importPath);
    }

    if (fs.existsSync(fullPath)) {
      return { contents: fs.readFileSync(fullPath, 'utf8') };
    }
    return { error: `File not found: ${fullPath}` };
  } catch (e) {
    return { error: e.message };
  }
}

async function main() {
  const rpcUrl = process.env.RPC_URL || process.argv[3] || RPC_ENDPOINTS[0];
  let privateKey = process.env.PRIVATE_KEY || process.argv[2];
  let wallet;

  console.log(`Connecting to RPC Provider: ${rpcUrl}...`);
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const keyFilePath = path.resolve(__dirname, '../.deployer_key.json');

  if (!privateKey) {
    if (fs.existsSync(keyFilePath)) {
      const data = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
      privateKey = data.privateKey;
      console.log(`\nFound existing deployer key in .deployer_key.json.`);
      console.log(`Resuming with Deployer Address: ${data.address}`);
    } else {
      console.log('\n========================================================');
      console.log('NO PRIVATE KEY PROVIDED. GENERATING TEMPORARY DEPLOYER...');
      const tempWallet = ethers.Wallet.createRandom(provider);
      privateKey = tempWallet.privateKey;
      
      fs.writeFileSync(keyFilePath, JSON.stringify({
        address: tempWallet.address,
        privateKey: tempWallet.privateKey
      }, null, 2));

      console.log(`\nTemporary Deployer Address: ${tempWallet.address}`);
      console.log('========================================================\n');
      console.log('To deploy the ConfidentialTokenWrappersRegistry contract, please fund this address');
      console.log('with at least 0.03 Sepolia ETH.');
      console.log(`Explorer Link: https://sepolia.etherscan.io/address/${tempWallet.address}`);
    }

    wallet = new ethers.Wallet(privateKey, provider);
    console.log('\nWaiting for funding (polling every 5 seconds)...');

    // Poll for balance
    while (true) {
      const balance = await provider.getBalance(wallet.address);
      if (balance > 0n) {
        console.log(`\nDetected funding: ${ethers.formatEther(balance)} ETH! Proceeding with deployment...`);
        break;
      }
      process.stdout.write('.');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } else {
    wallet = new ethers.Wallet(privateKey, provider);
    console.log(`Using Wallet Address: ${wallet.address}`);
    const balance = await provider.getBalance(wallet.address);
    console.log(`Wallet Balance: ${ethers.formatEther(balance)} ETH`);
    if (balance === 0n) {
      console.error('\nError: Wallet has 0 ETH. Please fund this address before running deployment.');
      process.exit(1);
    }
  }

  // 1. Read Solidity file
  const contractPath = path.resolve(__dirname, '../contracts/ConfidentialTokenWrappersRegistry.sol');
  const source = fs.readFileSync(contractPath, 'utf8');

  console.log('\nCompiling contract ConfidentialTokenWrappersRegistry.sol (with OpenZeppelin imports)...');

  // 2. Prepare Compiler input
  const input = {
    language: 'Solidity',
    sources: {
      'ConfidentialTokenWrappersRegistry.sol': {
        content: source,
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
    },
  };

  // 3. Compile contract with import callback
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  if (output.errors) {
    let hasError = false;
    for (const error of output.errors) {
      console.error(error.formattedMessage);
      if (error.severity === 'error') {
        hasError = true;
      }
    }
    if (hasError) {
      process.exit(1);
    }
  }

  const contractKey = 'ConfidentialTokenWrappersRegistry.sol';
  const contractName = 'ConfidentialTokenWrappersRegistry';
  const compiledContract = output.contracts[contractKey][contractName];
  const abi = compiledContract.abi;
  const bytecode = compiledContract.evm.bytecode.object;

  console.log('Compilation successful!');

  // 5. Deploy contract factory
  console.log('\nDeploying ConfidentialTokenWrappersRegistry...');
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  
  // Try deploying with manual gas settings to avoid provider estimation failures
  const contract = await factory.deploy({
    gasLimit: 3000000n // Upgradeable contracts have higher deployment gas cost
  });

  console.log('Transaction submitted. Waiting for deployment confirmation...');
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('\n========================================================');
  console.log('SUCCESS: ConfidentialTokenWrappersRegistry deployed!');
  console.log(`Contract Address: ${address}`);
  console.log('========================================================\n');

  // Save artifact
  const artifactsDir = path.resolve(__dirname, '../dist');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(artifactsDir, 'ConfidentialTokenWrappersRegistry.json'),
    JSON.stringify({ address, abi, bytecode }, null, 2)
  );
  console.log(`Saved deployment artifact to: dist/ConfidentialTokenWrappersRegistry.json`);

  // Clean up key file since we are done
  if (fs.existsSync(keyFilePath)) {
    fs.unlinkSync(keyFilePath);
  }
}

main().catch((err) => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
