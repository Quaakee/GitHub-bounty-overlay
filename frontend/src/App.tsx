import React, { useState, useEffect } from 'react';
import { PrivateKey, WalletClient, LookupResolver, Transaction, AuthFetch } from '@bsv/sdk';
import { Bounty } from './types';
import { UserData } from './types';

// Main App Component
const App = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState('home'); // home, createBounty, viewBounties, connect
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  // User state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [serverInfo, setServerInfo] = useState({ publicKey: '' });
  const [gitCertInfo, setGitCertInfo] = useState({ publicKey: '' });
  
  // Form states
  const [issueId, setIssueId] = useState('');
  const [amount, setAmount] = useState(10000);
  const [deadline, setDeadline] = useState(30);
  const [repoOwner, setRepoOwner] = useState('');
  
  // Bounties state
  const [bounties, setBounties] = useState<Bounty[]>([]);
  
  // SDK state
  const [walletClient, setWalletClient] = useState(null);
  const [authFetch, setAuthFetch] = useState<AuthFetch | null>(null);
  
  // Server URL (default from localStorage or use default)
  const defaultServerUrl = 'http://localhost:8080';
  const [serverUrl, setServerUrl] = useState(() => {
    return localStorage.getItem('bounty-server-url') || defaultServerUrl;
  });

  // Initialize the BSV SDK wallet client and AuthFetch
  useEffect(() => {
    try {
      const wallet = new WalletClient('json-api', 'localhost');
      
      // Initialize AuthFetch with the wallet client
      const client = new AuthFetch(wallet);
      setAuthFetch(client);
      
      console.log('BSV SDK WalletClient and AuthFetch initialized');
    } catch (error) {
      console.error('Failed to initialize BSV SDK components:', error);
    }
  }, []);

  // Save server URL to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('bounty-server-url', serverUrl);
  }, [serverUrl]);
  
  // Fetch server info on mount and when URL changes
  useEffect(() => {
    // Fetch server info
    async function fetchServerInfo() {
      try {
        const response = await fetch(`${serverUrl}/api/server-info`);
        if (response.ok) {
          const data = await response.json();
          setServerInfo(data);
        }
        
        // Also fetch the GitCert server's public key
        const gitcertResponse = await fetch(`${process.env.GITCERT_SERVER_URL || 'http://localhost:3002'}/api/server-info`);
        if (gitcertResponse.ok) {
          const gitcertData = await gitcertResponse.json();
          setGitCertInfo(gitcertData);
        }
      } catch (error) {
        console.error('Error fetching server info:', error);
      }
    }
    
    fetchServerInfo();
  }, [serverUrl]);
  
  // Fetch user data when component mounts
  useEffect(() => {
    async function fetchUserData() {
      try {
        const response = await fetch(`${serverUrl}/api/user-info`, {
          credentials: 'include' // Include cookies for session
        });
        
        const data = await response.json() as UserData;
        
        if (response.ok && data.authenticated) {
          setIsAuthenticated(true);
          setUserData(data);
        } else {
          setIsAuthenticated(false);
          setUserData(null);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setIsAuthenticated(false);
        setUserData(null);
      }
    }
    
    fetchUserData();
  }, [serverUrl]);
  
  // Function to handle GitHub login
  const handleGitHubLogin = () => {
    window.location.href = `http://localhost:5173/auth/github`;
  };
  
  // Function to handle logout
  const handleLogout = () => {
    window.location.href = `${serverUrl}/logout`;
  };
  
  // Function to get GitHub certificate
  const handleGetCertificate = async () => {
    window.location.href = `${process.env.GITCERT_SERVER_URL || 'http://localhost:3002'}`;
  };
  
  // Function to create a new bounty
  const handleCreateBounty = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    
    try {
      // Validate inputs
      if (!issueId || !repoOwner || amount < 1000) {
        throw new Error('Please fill all required fields with valid values');
      }
      
      if (!walletClient || !authFetch) {
        throw new Error('SDK components not initialized');
      }
      
      // Call API to create bounty using AuthFetch to handle 402 Payment Required responses
      const response = await authFetch.fetch(`${serverUrl}/api/bounties`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          issueId,
          repoOwner,
          amount,
          deadlineDays: deadline
        })
      });
      
      // If we get a payment required response, AuthFetch will handle it automatically
      
      if (!response.ok) {
        // Check if there was a specific error message in the response
        try {
          const error = await response.json();
          throw new Error(error.message || `Error ${response.status}: Failed to create bounty`);
        } catch (jsonError) {
          // If parsing JSON fails, throw generic error with status code
          throw new Error(`Error ${response.status}: Failed to create bounty`);
        }
      }
      
      const bounty = await response.json();
      setSuccessMessage(`Bounty created successfully! TXID: ${bounty.txid}`);
      
      // Reset form
      setIssueId('');
      setRepoOwner('');
      setAmount(10000);
      setDeadline(30);
    } catch (error) {
      console.error('Error creating bounty:', error);
      setErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Function to fetch all active bounties using BSV SDK
  const fetchBounties = async () => {
    setIsLoading(true);
    try {
      if (!walletClient || !authFetch) {
        throw new Error('SDK components not initialized');
      }
      
      // First try to use AuthFetch to handle payment-required endpoints
      try {
        // Make request to bounty service API using AuthFetch
        const response = await authFetch.fetch(`${serverUrl}/api/bounties?status=active`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setBounties(data);
          return;
        }
      } catch (authFetchError) {
        console.warn('AuthFetch request failed, falling back to overlay lookup:', authFetchError);
        // Continue to overlay lookup
      }
      
      // Fallback to using Overlay lookup if AuthFetch fails
      // Create a lookup resolver for the BSV overlay
      const resolver = new LookupResolver({ 
        networkPreset: 'local'
      });
      
      // Execute lookup query for the bounty service
      const result = await resolver.query({
        service: 'ls_bounty',
        query: { status: 'active' }
      });
      
      if (result.type !== 'output-list' || !result.outputs || result.outputs.length === 0) {
        // No bounties found, just set empty array
        setBounties([]);
        return;
      }
      
      // Transform the overlay outputs into usable bounty objects
      const bountyDetails = result.outputs.map(output => {
        try {
          const tx = Transaction.fromBEEF(output.beef);
          const lockingScript = tx.outputs[output.outputIndex].lockingScript;
          
          // Extract bounty details from the output
          // In a full implementation, you'd parse the locking script to extract the full details
          return {
            txid: tx.id('hex'),
            outputIndex: output.outputIndex,
            amount: tx.outputs[output.outputIndex].satoshis,
            issueId: `repo-owner/repo#${Math.floor(Math.random() * 100)}`, // Placeholder, would be extracted from script
            deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Placeholder, would be extracted from script
            status: 'active'
          };
        } catch (err) {
          console.error('Error parsing bounty:', err);
          return null;
        }
      }).filter(bounty => bounty !== null);
      
      setBounties(bountyDetails);
    } catch (error) {
      console.error('Error fetching bounties:', error);
      setErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
      
      // Last resort fallback to standard fetch if everything else fails
      try {
        const response = await fetch(`${serverUrl}/api/bounties?status=active`);
        if (!response.ok) {
          throw new Error('Failed to fetch bounties');
        }
        
        const data = await response.json();
        setBounties(data);
      } catch (fallbackError) {
        console.error('All bounty fetch methods failed:', fallbackError);
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch bounties when viewing the bounties page
  useEffect(() => {
    if (view === 'viewBounties') {
      fetchBounties();
    }
  }, [view]);
  
  // Function to claim a bounty
  const handleClaimBounty = async (txid: String, outputIndex: Number) => {
    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    
    try {
      if (!walletClient || !authFetch) {
        throw new Error('SDK components not initialized');
      }
      
      // Need to prompt for Pull Request ID
      const prId = prompt('Enter Pull Request ID that resolves this issue:');
      if (!prId) {
        setIsLoading(false);
        return;
      }
      
      // Use AuthFetch to handle 402 Payment Required automatically
      const response = await authFetch.fetch(`${serverUrl}/api/bounties/${txid}/${outputIndex}/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prId
        })
      });
      
      if (!response.ok) {
        // Check if there was a specific error message in the response
        try {
          const error = await response.json();
          throw new Error(error.message || `Error ${response.status}: Failed to claim bounty`);
        } catch (jsonError) {
          // If parsing JSON fails, throw generic error with status code
          throw new Error(`Error ${response.status}: Failed to claim bounty`);
        }
      }
      
      const result = await response.json();
      setSuccessMessage(`Bounty claimed successfully! Payment TXID: ${result.txid}`);
      
      // Refresh bounties
      fetchBounties();
    } catch (error) {
      console.error('Error claiming bounty:', error);
      setErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Main render method
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="bg-gray-900 text-white p-6 rounded-lg mb-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">GitHub Bounty Overlay</h1>
            <div className="space-x-4">
              <button
                onClick={() => setView('home')}
                className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
              >
                Home
              </button>
              {isAuthenticated && (
                <>
                  <button
                    onClick={() => setView('createBounty')}
                    className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
                  >
                    Create Bounty
                  </button>
                  <button
                    onClick={() => setView('viewBounties')}
                    className="px-4 py-2 bg-purple-600 rounded hover:bg-purple-700"
                  >
                    View Bounties
                  </button>
                </>
              )}
              {!isAuthenticated ? (
                <button
                  onClick={handleGitHubLogin}
                  className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
                >
                  Login with GitHub
                </button>
              ) : (
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-red-600 rounded hover:bg-red-700"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        </header>
        
        {/* Alert Messages */}
        {successMessage && (
          <div className="bg-green-100 border border-green-200 text-green-800 px-4 py-3 rounded mb-6">
            {successMessage}
          </div>
        )}
        {errorMessage && (
          <div className="bg-red-100 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
            {errorMessage}
          </div>
        )}
        
        {/* Main Content Area */}
        <main className="bg-white p-8 rounded-lg shadow-md">
          {/* Loading Indicator */}
          {isLoading && (
            <div className="text-center my-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              <p className="mt-2 text-gray-600">Loading...</p>
            </div>
          )}
          
          {/* Home View */}
          {view === 'home' && (
            <div>
              <h2 className="text-2xl font-semibold mb-6">Welcome to GitHub Bounty Overlay</h2>
              
              {!isAuthenticated ? (
                <div className="text-center py-8">
                  <p className="mb-6 text-gray-600">
                    Please login with GitHub to start creating or claiming bounties
                  </p>
                  <button
                    onClick={handleGitHubLogin}
                    className="inline-flex items-center px-5 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-700"
                  >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 01-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 010 8c0-4.42 3.58-8 8-8z"></path>
                    </svg>
                    Login with GitHub
                  </button>
                </div>
              ) : (
                <div className="mb-8">
                  <div className="flex items-center mb-6">
                    <img
                      src={userData?.avatarUrl || "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"}
                      alt="Profile"
                      className="w-16 h-16 rounded-full mr-4"
                    />
                    <div>
                      <h3 className="text-xl font-semibold">Welcome, {userData?.displayName || userData?.username}!</h3>
                      <p className="text-gray-600">@{userData?.username || 'username'}</p>
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <h4 className="text-lg font-medium mb-2">Server Connection</h4>
                    <div className="flex space-x-2 mb-2">
                      <input
                        type="url"
                        value={serverUrl}
                        onChange={(e) => setServerUrl(e.target.value)}
                        className="flex-grow px-3 py-2 border border-gray-300 rounded"
                        placeholder="Server URL"
                      />
                      <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-gray-200 rounded"
                      >
                        Reconnect
                      </button>
                    </div>
                    <div className="text-sm text-gray-600">
                      Server Public Key: {serverInfo.publicKey ? 
                        (serverInfo.publicKey.substring(0, 8) + '...' + serverInfo.publicKey.substring(serverInfo.publicKey.length - 8)) 
                        : "Not connected"}
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <h4 className="text-lg font-medium mb-2">Get Identity Certificate</h4>
                    <p className="text-gray-600 mb-4">
                      Before creating or claiming bounties, obtain a GitHub identity certificate:
                    </p>
                    <button
                      onClick={handleGetCertificate}
                      disabled={isLoading}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isLoading ? "Processing..." : "Get GitHub Certificate"}
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                      <h3 className="text-xl font-semibold mb-3">Create a Bounty</h3>
                      <p className="text-gray-600 mb-4">
                        Fund a GitHub issue and reward developers for fixing it.
                      </p>
                      <button
                        onClick={() => setView('createBounty')}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Create Bounty
                      </button>
                    </div>
                    
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                      <h3 className="text-xl font-semibold mb-3">View Bounties</h3>
                      <p className="text-gray-600 mb-4">
                        Browse available bounties or claim rewards for your work.
                      </p>
                      <button
                        onClick={() => setView('viewBounties')}
                        className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                      >
                        View Bounties
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* How It Works Section */}
              <div className="mt-12">
                <h3 className="text-xl font-semibold text-center mb-8">How It Works</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gray-50 p-6 rounded-lg text-center">
                    <div className="text-4xl mb-4">💰</div>
                    <h4 className="text-lg font-medium mb-2">Fund an Issue</h4>
                    <p className="text-gray-600">Create a bounty by locking BSV to a GitHub issue</p>
                  </div>
                  
                  <div className="bg-gray-50 p-6 rounded-lg text-center">
                    <div className="text-4xl mb-4">👩‍💻</div>
                    <h4 className="text-lg font-medium mb-2">Solve the Issue</h4>
                    <p className="text-gray-600">Developers work on the issue and submit a PR</p>
                  </div>
                  
                  <div className="bg-gray-50 p-6 rounded-lg text-center">
                    <div className="text-4xl mb-4">🔐</div>
                    <h4 className="text-lg font-medium mb-2">Verify & Reward</h4>
                    <p className="text-gray-600">When PR is merged, the solver claims the bounty</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Create Bounty View */}
          {view === 'createBounty' && (
            <div>
              <h2 className="text-2xl font-semibold mb-6">Create a New Bounty</h2>
              
              <form onSubmit={handleCreateBounty} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Issue ID (format: "owner/repo#issue_number")
                  </label>
                  <input
                    type="text"
                    value={issueId}
                    onChange={(e) => setIssueId(e.target.value)}
                    placeholder="e.g., bitcoin-sv/overlay#123"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Repository Owner GitHub Username
                  </label>
                  <input
                    type="text"
                    value={repoOwner}
                    onChange={(e) => setRepoOwner(e.target.value)}
                    placeholder="GitHub username of repo owner"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bounty Amount (satoshis)
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    min="1000"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Deadline (days)
                  </label>
                  <input
                    type="number"
                    value={deadline}
                    onChange={(e) => setDeadline(Number(e.target.value))}
                    min="1"
                    max="365"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full px-5 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {isLoading ? "Creating..." : "Create Bounty"}
                  </button>
                </div>
              </form>
            </div>
          )}
          
          {/* View Bounties View */}
          {view === 'viewBounties' && (
            <div>
              <h2 className="text-2xl font-semibold mb-6">Active Bounties</h2>
              
              <div className="flex justify-end mb-4">
                <button
                  onClick={fetchBounties}
                  className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                >
                  Refresh
                </button>
              </div>
              
              {bounties.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  No active bounties found
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr>
                        <th className="py-3 px-4 border-b text-left">Issue</th>
                        <th className="py-3 px-4 border-b text-right">Amount</th>
                        <th className="py-3 px-4 border-b text-center">Deadline</th>
                        <th className="py-3 px-4 border-b text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bounties.map((bounty) => (
                        <tr key={`${bounty.txid}-${bounty.outputIndex}`} className="hover:bg-gray-50">
                          <td className="py-4 px-4 border-b">
                            <a
                              href={`https://github.com/${bounty.issueId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {bounty.issueId}
                            </a>
                          </td>
                          <td className="py-4 px-4 border-b text-right font-mono">
                            {bounty.amount?.toLocaleString()} sats
                          </td>
                          <td className="py-4 px-4 border-b text-center">
                            {new Date(bounty.deadline).toLocaleDateString()}
                          </td>
                          <td className="py-4 px-4 border-b text-center">
                            <button
                              onClick={() => handleClaimBounty(bounty.txid, bounty.outputIndex)}
                              className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                            >
                              Claim
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
        
        {/* Footer */}
        <footer className="mt-12 py-6 text-center text-gray-600">
          <p>GitHub Bounty Overlay &copy; 2025 - Powered by BSV</p>
          <p className="text-sm mt-2">Built with BSV Overlay Services Engine</p>
        </footer>
      </div>
    </div>
  );
};

export default App;