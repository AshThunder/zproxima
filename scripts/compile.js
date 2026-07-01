import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function main() {
  const contractPath = path.resolve(__dirname, '../contracts/ConfidentialWrapper.sol');
  const source = fs.readFileSync(contractPath, 'utf8');

  console.log('Compiling ConfidentialWrapper.sol...');

  const input = {
    language: 'Solidity',
    sources: {
      'ConfidentialWrapper.sol': {
        content: source,
      },
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

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

  const contractKey = 'ConfidentialWrapper.sol';
  const contractName = 'ConfidentialWrapper';
  const compiledContract = output.contracts[contractKey][contractName];
  const abi = compiledContract.abi;
  const bytecode = compiledContract.evm.bytecode.object;

  const artifactsDir = path.resolve(__dirname, '../src/config/contracts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(artifactsDir, 'ConfidentialWrapper.json'),
    JSON.stringify({ abi, bytecode }, null, 2)
  );

  console.log('Successfully compiled and saved artifact to src/config/contracts/ConfidentialWrapper.json');
}

try {
  main();
} catch (err) {
  console.error('Compilation failed:', err);
  process.exit(1);
}
