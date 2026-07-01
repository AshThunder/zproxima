// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/**
 * @title ConfidentialWrapper (Mock Compatible with ERC-7984)
 * @notice Standard-compliant mock wrapper that implements the same ABI as Zama's ConfidentialWrapper.
 * Allows wrapping and unwrapping any ERC-20 token for frontend testing on standard Sepolia.
 */
contract ConfidentialWrapper is IERC165 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    
    IERC20 public underlying;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) private _blockedUsers;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event UserBlocked(address indexed user);
    event UserUnblocked(address indexed user);

    constructor(
        string memory name_,
        string memory symbol_,
        IERC20 underlying_
    ) {
        name = name_;
        symbol = symbol_;
        underlying = underlying_;
        decimals = 6; // Matching mock token decimals
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }

    function transfer(address to, uint256 value) public returns (bool) {
        require(!_blockedUsers[msg.sender], "Blocked user");
        require(!_blockedUsers[to], "Blocked user");
        require(balanceOf[msg.sender] >= value, "Insufficient balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) public returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public returns (bool) {
        require(!_blockedUsers[msg.sender], "Blocked user");
        require(!_blockedUsers[from], "Blocked user");
        require(!_blockedUsers[to], "Blocked user");
        require(balanceOf[from] >= value, "Insufficient balance");
        require(allowance[from][msg.sender] >= value, "Insufficient allowance");
        allowance[from][msg.sender] -= value;
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }

    // --- ERC-7984 Wrapper Functions ---

    /**
     * @notice Wrap underlying tokens to mint confidential wrapper tokens.
     */
    function wrap(address to, uint256 amount) public returns (uint256) {
        require(!_blockedUsers[msg.sender], "Blocked user");
        require(!_blockedUsers[to], "Blocked user");
        
        // Pull underlying tokens
        require(underlying.transferFrom(msg.sender, address(this), amount), "Underlying transfer failed");
        
        // Mint wrapped tokens
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
        return amount;
    }

    /**
     * @notice Unwrap confidential wrapper tokens back to underlying tokens.
     */
    function unwrap(address to, uint256 amount) public returns (uint256) {
        require(!_blockedUsers[msg.sender], "Blocked user");
        require(!_blockedUsers[to], "Blocked user");
        require(balanceOf[msg.sender] >= amount, "Insufficient wrapper balance");

        // Burn wrapped tokens
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);

        // Push underlying tokens back
        require(underlying.transfer(to, amount), "Underlying transfer failed");
        return amount;
    }

    // --- Faucet Mint (convenience) ---
    function mint(address to, uint256 amount) public returns (bool) {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
        return true;
    }

    // --- Denylist Administration ---
    function blockUser(address user) external onlyOwner {
        _blockedUsers[user] = true;
        emit UserBlocked(user);
    }

    function unblockUser(address user) external onlyOwner {
        _blockedUsers[user] = false;
        emit UserUnblocked(user);
    }

    function isBlocked(address user) public view returns (bool) {
        return _blockedUsers[user];
    }

    // --- ERC-165 Interface Check ---
    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == 0x01ffc9a7 || // ERC-165
               interfaceId == 0x4958f2a4;   // ERC-7984 interface ID
    }
}
