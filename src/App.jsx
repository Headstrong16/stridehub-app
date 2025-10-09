import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    signOut, 
    onAuthStateChanged,
    // signInAnonymously is not needed for this public sign-in flow
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    query, 
    addDoc,
    doc,
    updateDoc,
    arrayUnion,
    arrayRemove,
    deleteDoc // For group deletion
} from 'firebase/firestore';

// =================================================================
// 🚨 CRITICAL: YOUR FIREBASE CONFIGURATION IS INSERTED HERE
// =================================================================
const firebaseConfig = {
  apiKey: "AIzaSyAf06-mVKCBwUAMHdYHF3Ffx4CxNpkTaWU",
  authDomain: "stride-hub-35e98.firebaseapp.com",
  projectId: "stride-hub-35e98",
  storageBucket: "stride-hub-35e98.firebasestorage.app",
  messagingSenderId: "768211987621",
  appId: "1:768211987621:web:0e600a5704b4d69da1314c"
};
const initialAuthToken = null; // Public deployments use standard sign-in

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Define pages for navigation
const VIEWS = {
    GROUP_LIST: 'GROUP_LIST',
    GROUP_DETAIL: 'GROUP_DETAIL',
    PROFILE: 'PROFILE'
};

// =================================================================
// MAIN APP COMPONENT
// =================================================================

const App = () => {
    // Application State
    const [user, setUser] = useState(null);
    const [groups, setGroups] = useState([]);
    const [currentView, setCurrentView] = useState(VIEWS.GROUP_LIST);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupDescription, setNewGroupDescription] = useState(''); 
    const [newGroupPictureUrl, setNewGroupPictureUrl] = useState(''); 
    const [feedbackMessage, setFeedbackMessage] = useState({ text: '', type: '' }); // type: 'success' or 'error'

    // 1. AUTHENTICATION LISTENER
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setIsAuthReady(true);
            setLoading(false);
            if (!currentUser) {
                // If no user, show the login screen (default view)
                setCurrentView(VIEWS.GROUP_LIST);
            }
        });

        // Clean up subscription on unmount
        return () => unsubscribe();
    }, []);

    // 2. DATA LISTENER (Groups)
    useEffect(() => {
        if (!isAuthReady) return; // Wait until auth state is known

        // Reference to the public collection path
        const groupsCollectionRef = collection(db, `artifacts/${firebaseConfig.appId}/public/data/groups`);
        
        // Listen for real-time updates
        const unsubscribe = onSnapshot(groupsCollectionRef, (snapshot) => {
            const groupsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setGroups(groupsData);
        }, (error) => {
            console.error("Error fetching groups:", error);
            setFeedbackMessage({ text: 'Error loading groups.', type: 'error' });
        });

        // Clean up subscription on unmount
        return () => unsubscribe();
    }, [isAuthReady]);


    // Handlers
    const handleSignIn = async () => {
        try {
            await signInWithPopup(auth, provider);
            setFeedbackMessage({ text: 'Signed in successfully!', type: 'success' });
        } catch (error) {
            console.error("Sign-in error:", error);
            
            let displayMessage = `Login failed: ${error.message}`;
            if (error.code === 'auth/unauthorized-domain') {
                 displayMessage = 'Login failed: The domain where this app is running is not authorized by Firebase. Please add this domain to the "Authorized domains" list in your Firebase Authentication settings.';
            }

            setFeedbackMessage({ text: displayMessage, type: 'error' });
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            setFeedbackMessage({ text: 'Signed out successfully!', type: 'success' });
        } catch (error) {
            console.error("Sign-out error:", error);
            setFeedbackMessage({ text: 'Sign out failed.', type: 'error' });
        }
    };

    const handleCreateGroup = async () => {
        if (!user || !newGroupName.trim()) {
            setFeedbackMessage({ text: 'Please sign in and provide a group name.', type: 'error' });
            return;
        }

        const groupName = newGroupName.trim();

        try {
            const newGroupData = {
                name: groupName,
                description: newGroupDescription.trim() || 'No description provided.',
                pictureUrl: newGroupPictureUrl.trim() || 'https://placehold.co/100x100/A5B4FC/3730A3?text=STRIDE', 
                creatorId: user.uid,
                creatorName: user.displayName || 'Anonymous User',
                members: [user.uid],
                createdAt: new Date().toISOString(),
                memberCount: 1,
            };
            
            const groupsCollectionRef = collection(db, `artifacts/${firebaseConfig.appId}/public/data/groups`);
            await addDoc(groupsCollectionRef, newGroupData);

            // --- JUMPING CURSOR FIX: Only reset state AFTER successful DB operation ---
            setNewGroupName('');
            setNewGroupDescription('');
            setNewGroupPictureUrl('');
            // --- END FIX ---
            
            setFeedbackMessage({ text: `Group "${groupName}" created successfully!`, type: 'success' }); 

        } catch (error) {
            console.error("Error creating group:", error);
            setFeedbackMessage({ text: `Failed to create group: ${error.message}`, type: 'error' });
        }
    };
    
    const handleDeleteGroup = async (groupId) => {
        if (!user || !selectedGroup || selectedGroup.creatorId !== user.uid) {
            setFeedbackMessage({ text: 'You are not authorized to delete this group.', type: 'error' });
            return;
        }
        
        // Simple confirmation via feedback message
        if (!window.confirm(`Are you sure you want to permanently delete the group "${selectedGroup.name}"?`)) {
            return;
        }

        try {
            const groupRef = doc(db, `artifacts/${firebaseConfig.appId}/public/data/groups`, groupId);
            await deleteDoc(groupRef);

            // Reset view after deletion
            setSelectedGroup(null);
            setCurrentView(VIEWS.GROUP_LIST);
            setFeedbackMessage({ text: `Group "${selectedGroup.name}" deleted successfully.`, type: 'success' });

        } catch (error) {
            console.error("Error deleting group:", error);
            setFeedbackMessage({ text: `Deletion failed: ${error.message}`, type: 'error' });
        }
    };
    
    const handleJoinLeaveGroup = async (groupId, isMember) => {
        if (!user) {
            setFeedbackMessage({ text: 'You must be signed in to join or leave a group.', type: 'error' });
            return;
        }

        try {
            const groupRef = doc(db, `artifacts/${firebaseConfig.appId}/public/data/groups`, groupId);
            
            // Find the group to get current count, safety check
            const currentGroup = groups.find(g => g.id === groupId);
            if (!currentGroup) return;

            if (isMember) {
                // Leaving the group
                await updateDoc(groupRef, {
                    members: arrayRemove(user.uid),
                    memberCount: currentGroup.memberCount - 1
                });
                setFeedbackMessage({ text: 'Left group successfully.', type: 'success' });
            } else {
                // Joining the group
                await updateDoc(groupRef, {
                    members: arrayUnion(user.uid),
                    memberCount: currentGroup.memberCount + 1
                });
                setFeedbackMessage({ text: 'Joined group successfully!', type: 'success' });
            }
        } catch (error) {
            console.error("Error joining/leaving group:", error);
            setFeedbackMessage({ text: `Action failed: ${error.message}`, type: 'error' });
        }
    };

    const navigateToGroupDetail = (group) => {
        setSelectedGroup(group);
        setCurrentView(VIEWS.GROUP_DETAIL);
    };

    // UI Components

    const Header = () => (
        <header className="bg-indigo-700 text-white p-4 shadow-xl flex justify-between items-center sticky top-0 z-10">
            <h1 className="text-2xl font-black tracking-widest cursor-pointer" onClick={() => setCurrentView(VIEWS.GROUP_LIST)}>
                STRIDEHUB
            </h1>
            <nav className="flex items-center space-x-4">
                {user ? (
                    <>
                        <span className="text-sm hidden md:inline font-medium">Hi, {user.displayName || 'Runner'}</span>
                        <button 
                            onClick={handleSignOut} 
                            className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg text-sm font-bold transition duration-150 shadow-md"
                        >
                            Sign Out
                        </button>
                    </>
                ) : (
                    <button 
                        onClick={handleSignIn} 
                        className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg text-sm font-bold transition duration-150 shadow-md"
                    >
                        Sign In with Google
                    </button>
                )}
            </nav>
        </header>
    );

    const FeedbackBar = () => {
        if (!feedbackMessage.text) return null;
        
        const baseStyle = "p-3 text-sm font-medium rounded-xl mt-4 shadow-lg mx-auto max-w-4xl";
        const style = feedbackMessage.type === 'success' 
            ? "bg-green-100 text-green-700 border border-green-300" 
            : "bg-red-100 text-red-700 border border-red-300";

        return (
            <div className={`${baseStyle} ${style} flex justify-between items-center`}>
                <p>{feedbackMessage.text}</p>
                <button onClick={() => setFeedbackMessage({ text: '', type: '' })} className="ml-4 font-bold text-lg leading-none">&times;</button>
            </div>
        );
    };

    const GroupCard = ({ group }) => {
        const isMember = user && group.members && group.members.includes(user.uid);
        const joinLeaveText = isMember ? 'Leave' : 'Join';
        const joinLeaveStyle = isMember 
            ? 'bg-red-500 hover:bg-red-600' 
            : 'bg-indigo-500 hover:bg-indigo-600';
        
        return (
            <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-100 flex flex-col h-full">
                <div className="flex items-center mb-3">
                    <img 
                        src={group.pictureUrl || 'https://placehold.co/100x100/A5B4FC/3730A3?text=STRIDE'} 
                        alt={`${group.name} picture`} 
                        className="w-12 h-12 rounded-full object-cover mr-4"
                        onError={(e) => e.target.src = 'https://placehold.co/100x100/A5B4FC/3730A3?text=STRIDE'}
                    />
                    <div>
                         <h3 className="text-xl font-semibold text-indigo-700">{group.name}</h3>
                         <p className="text-xs text-gray-500">Created by {group.creatorName}</p>
                    </div>
                </div>
                
                <p className="text-gray-600 text-sm mb-4 line-clamp-2 flex-grow">{group.description || 'No description provided.'}</p>
                
                <div className="flex justify-between items-center border-t pt-3 mt-auto">
                    <p className="text-gray-700 text-sm font-bold">
                        {group.memberCount} Runners
                    </p>
                    <div className="flex space-x-2">
                        <button 
                            onClick={() => navigateToGroupDetail(group)}
                            className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                        >
                            Details
                        </button>
                        {user && (
                            <button 
                                onClick={() => handleJoinLeaveGroup(group.id, isMember)}
                                className={`${joinLeaveStyle} text-white px-3 py-1 rounded-full text-sm font-medium transition duration-150 shadow-md`}
                            >
                                {joinLeaveText}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const GroupListView = () => (
        <div className="p-4 sm:p-8 max-w-6xl mx-auto">
            <div className="bg-white p-6 md:p-8 rounded-xl shadow-2xl border border-indigo-100 mb-8">
                <h2 className="text-3xl font-extrabold text-gray-900 mb-2">Find Your Tribe</h2>
                <p className="text-gray-600 mb-6">Discover local running groups, events, and connect with fellow runners in your area.</p>

                {user && (
                    <div className="space-y-4 pt-4 border-t border-gray-200">
                        <h3 className="text-xl font-bold text-indigo-700">Create a New Group</h3>
                         <input 
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="1. Group Name (e.g., Morning Trail Crew)"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <textarea 
                            value={newGroupDescription}
                            onChange={(e) => setNewGroupDescription(e.target.value)}
                            placeholder="2. Group Description (e.g., We meet every Saturday at 6 AM at Central Park.)"
                            rows="2"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <input 
                            type="url"
                            value={newGroupPictureUrl}
                            onChange={(e) => setNewGroupPictureUrl(e.target.value)}
                            placeholder="3. Group Picture URL (Optional, must be a direct image link)"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <button 
                            onClick={handleCreateGroup}
                            className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold transition duration-150 shadow-lg hover:shadow-xl"
                        >
                            Create Group
                        </button>
                    </div>
                )}

                {!user && (
                    <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-700 rounded-lg">
                        <p className="font-medium">Sign in to create or join groups!</p>
                    </div>
                )}
            </div>

            <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">All Groups ({groups.length})</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {groups.length === 0 ? (
                    <p className="text-gray-500 col-span-full text-center py-10">No groups found. Be the first to create one!</p>
                ) : (
                    groups.map(group => <GroupCard key={group.id} group={group} />)
                )}
            </div>
        </div>
    );

    const GroupDetailView = () => {
        if (!selectedGroup) return null;
        
        const isCreator = user && selectedGroup.creatorId === user.uid;
        const isMember = user && selectedGroup.members && selectedGroup.members.includes(user.uid);

        return (
            <div className="p-4 sm:p-8 max-w-4xl mx-auto">
                <button 
                    onClick={() => setCurrentView(VIEWS.GROUP_LIST)} 
                    className="text-indigo-600 hover:text-indigo-800 font-medium mb-6 flex items-center transition duration-150"
                >
                    <span className="text-xl mr-2">&larr;</span> Back to All Groups
                </button>
                
                <div className="bg-white p-8 rounded-xl shadow-2xl border border-indigo-100">
                    <div className="flex items-start mb-6 border-b pb-4">
                         <img 
                            src={selectedGroup.pictureUrl || 'https://placehold.co/100x100/A5B4FC/3730A3?text=STRIDE'} 
                            alt={`${selectedGroup.name} picture`} 
                            className="w-20 h-20 rounded-xl object-cover mr-6 shadow-md"
                            onError={(e) => e.target.src = 'https://placehold.co/100x100/A5B4FC/3730A3?text=STRIDE'}
                        />
                        <div>
                            <h2 className="text-4xl font-extrabold text-indigo-700 mb-1">{selectedGroup.name}</h2>
                            <p className="text-sm text-gray-500">
                                Created by <span className="font-semibold text-gray-700">{selectedGroup.creatorName}</span>
                            </p>
                        </div>
                    </div>

                    <h3 className="text-xl font-bold text-gray-800 mb-2">Description</h3>
                    <p className="text-gray-700 mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        {selectedGroup.description || 'The group creator has not added a detailed description yet.'}
                    </p>

                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                            <p className="text-sm text-indigo-500 font-medium">TOTAL RUNNERS</p>
                            <p className="text-3xl font-bold text-indigo-700">{selectedGroup.memberCount}</p>
                        </div>
                        <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                             <p className="text-sm text-yellow-600 font-medium">STATUS</p>
                            <p className="text-xl font-bold text-yellow-700">{isMember ? 'You are a Member' : 'Not Joined'}</p>
                        </div>
                    </div>

                    <h3 className="text-2xl font-semibold text-gray-800 border-b pb-2 mb-4">Current Members (User IDs)</h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                        {selectedGroup.members && selectedGroup.members.map((memberId, index) => (
                            <div key={index} className="flex items-center space-x-3 p-3 bg-gray-100 rounded-lg shadow-sm">
                                <span className="text-sm font-mono text-gray-700 truncate">{memberId}</span>
                            </div>
                        ))}
                        {!selectedGroup.members || selectedGroup.members.length === 0 && (
                             <p className="text-gray-500 p-3">No members yet. Be the first to join!</p>
                        )}
                    </div>
                    
                    <div className="mt-8 flex justify-center space-x-4">
                        {/* Join/Leave Button */}
                        {user && (
                            <button 
                                 onClick={() => handleJoinLeaveGroup(selectedGroup.id, isMember)}
                                className={`text-white px-8 py-3 rounded-full font-bold transition duration-150 shadow-lg ${isMember ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                            >
                                 {isMember ? 'Leave This Group' : 'Join This Group'}
                            </button>
                        )}
                        
                        {/* Delete Button (Creator Only) */}
                        {isCreator && (
                            <button 
                                 onClick={() => handleDeleteGroup(selectedGroup.id)}
                                className="bg-gray-400 hover:bg-gray-500 text-white px-8 py-3 rounded-full font-bold transition duration-150 shadow-lg"
                            >
                                Delete Group (Creator)
                            </button>
                        )}
                        
                    </div>
                </div>
            </div>
        );
    };
    
    // Main Render Logic
    if (loading) {
        return <div className="flex items-center justify-center min-h-screen text-xl text-indigo-600">Loading App...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <Header />
            {/* The FeedbackBar is placed outside the main content wrapper to ensure it doesn't cause layout shift */}
            <FeedbackBar /> 
            <main>
                {/* Router based on currentView state */}
                {currentView === VIEWS.GROUP_LIST && <GroupListView />}
                {currentView === VIEWS.GROUP_DETAIL && selectedGroup && <GroupDetailView />}

                 <div className="fixed bottom-0 right-0 p-3 text-xs text-gray-500 bg-white border-t border-l rounded-tl-lg shadow-inner">
                    <p>App ID: {firebaseConfig.appId.substring(0, 30)}...</p>
                </div>
            </main>
        </div>
    );
};

export default App;

// =================================================================
// MANDATORY REACT INITIALIZATION FOR SINGLE-FILE JSX
// =================================================================
/* eslint-disable no-undef */ 
const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(React.createElement(App));
/* eslint-enable no-undef */

// Add the necessary library imports and root element to the generated file structure
document.body.innerHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>STRIDEHUB Community App</title>
        <!-- Tailwind CSS CDN -->
        <script src="https://cdn.tailwindcss.com"></script>
        <!-- React and ReactDOM CDNs -->
        <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    </head>
    <body>
        <div id="root"></div>
        <script type="module">
            import App from './src/App.jsx'; // Import the main component
            
            // Get the root element
            const rootElement = document.getElementById('root');
            if (rootElement) {
                // Initialize React 18 root and render the App component
                const root = ReactDOM.createRoot(rootElement);
                root.render(React.createElement(App));
            } else {
                console.error("Root element #root not found in the document.");
            }
        </script>
    </body>
    </html>
`;
