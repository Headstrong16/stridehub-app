import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    signOut, 
    onAuthStateChanged,
    signInAnonymously
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    query, 
    where, 
    addDoc,
    doc,
    updateDoc,
    arrayUnion,
    arrayRemove
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
            setFeedbackMessage({ text: `Login failed: ${error.message}`, type: 'error' });
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

        try {
            const newGroupData = {
                name: newGroupName.trim(),
                creatorId: user.uid,
                creatorName: user.displayName || 'Anonymous User',
                members: [user.uid],
                createdAt: new Date().toISOString(),
                memberCount: 1,
            };
            
            const groupsCollectionRef = collection(db, `artifacts/${firebaseConfig.appId}/public/data/groups`);
            await addDoc(groupsCollectionRef, newGroupData);

            setNewGroupName('');
            setFeedbackMessage({ text: `Group "${newGroupName}" created successfully!`, type: 'success' });

        } catch (error) {
            console.error("Error creating group:", error);
            setFeedbackMessage({ text: `Failed to create group: ${error.message}`, type: 'error' });
        }
    };
    
    const handleJoinLeaveGroup = async (groupId, isMember) => {
        if (!user) {
            setFeedbackMessage({ text: 'You must be signed in to join or leave a group.', type: 'error' });
            return;
        }

        try {
            const groupRef = doc(db, `artifacts/${firebaseConfig.appId}/public/data/groups`, groupId);
            
            if (isMember) {
                // Leaving the group
                await updateDoc(groupRef, {
                    members: arrayRemove(user.uid),
                    memberCount: groups.find(g => g.id === groupId).memberCount - 1
                });
                setFeedbackMessage({ text: 'Left group successfully.', type: 'success' });
            } else {
                // Joining the group
                await updateDoc(groupRef, {
                    members: arrayUnion(user.uid),
                    memberCount: groups.find(g => g.id === groupId).memberCount + 1
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
        <header className="bg-indigo-600 text-white p-4 shadow-lg flex justify-between items-center sticky top-0 z-10">
            <h1 className="text-2xl font-bold tracking-wider cursor-pointer" onClick={() => setCurrentView(VIEWS.GROUP_LIST)}>
                STRIDEHUB
            </h1>
            <nav className="flex items-center space-x-4">
                {user ? (
                    <>
                        <span className="text-sm hidden sm:inline">Hi, {user.displayName || 'Runner'}</span>
                        <button 
                            onClick={handleSignOut} 
                            className="bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-full text-sm font-medium transition duration-150 shadow-md"
                        >
                            Sign Out
                        </button>
                    </>
                ) : (
                    <button 
                        onClick={handleSignIn} 
                        className="bg-green-500 hover:bg-green-600 px-3 py-1.5 rounded-full text-sm font-medium transition duration-150 shadow-md"
                    >
                        Sign In with Google
                    </button>
                )}
            </nav>
        </header>
    );

    const FeedbackBar = () => {
        if (!feedbackMessage.text) return null;
        
        const baseStyle = "p-3 text-sm font-medium rounded-lg mb-4 shadow-md";
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
        const isMember = user && group.members.includes(user.uid);
        const joinLeaveText = isMember ? 'Leave Group' : 'Join Group';
        const joinLeaveStyle = isMember 
            ? 'bg-red-500 hover:bg-red-600' 
            : 'bg-indigo-500 hover:bg-indigo-600';
        
        return (
            <div className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition duration-300 transform hover:scale-[1.01]">
                <h3 className="text-xl font-semibold text-indigo-700 mb-2">{group.name}</h3>
                <p className="text-gray-600 text-sm mb-4">
                    <span className="font-bold">{group.memberCount}</span> Runners | Created by {group.creatorName}
                </p>
                <div className="flex justify-between items-center">
                    <button 
                        onClick={() => navigateToGroupDetail(group)}
                        className="text-indigo-500 hover:text-indigo-700 text-sm font-medium"
                    >
                        View Details →
                    </button>
                    {user && (
                        <button 
                            onClick={() => handleJoinLeaveGroup(group.id, isMember)}
                            className={`${joinLeaveStyle} text-white px-4 py-2 rounded-full text-sm font-medium transition duration-150`}
                        >
                            {joinLeaveText}
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const GroupListView = () => (
        <div className="p-4 sm:p-8 max-w-4xl mx-auto">
            <FeedbackBar />

            <div className="bg-white p-6 rounded-xl shadow-xl mb-8">
                <h2 className="text-3xl font-extrabold text-gray-900 mb-2">Find Your Tribe</h2>
                <p className="text-gray-600 mb-6">Discover local running groups, events, and connect with FRunners!</p>

                {user && (
                    <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
                        <input 
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="Enter new group name..."
                            className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <button 
                            onClick={handleCreateGroup}
                            className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-bold transition duration-150 shadow-md"
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {groups.length === 0 ? (
                    <p className="text-gray-500 col-span-2 text-center">No groups found. Be the first to create one!</p>
                ) : (
                    groups.map(group => <GroupCard key={group.id} group={group} />)
                )}
            </div>
        </div>
    );

    const GroupDetailView = () => (
        <div className="p-4 sm:p-8 max-w-4xl mx-auto">
             <FeedbackBar />
            <button 
                onClick={() => setCurrentView(VIEWS.GROUP_LIST)} 
                className="text-indigo-600 hover:text-indigo-800 font-medium mb-6 flex items-center"
            >
                &larr; Back to All Groups
            </button>
            
            <div className="bg-white p-8 rounded-xl shadow-xl">
                <h2 className="text-4xl font-extrabold text-indigo-700 mb-4">{selectedGroup.name}</h2>
                <p className="text-lg text-gray-600 mb-6">A community for runners in {selectedGroup.location || 'Your Local Area'}.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                    <div className="p-4 bg-indigo-50 rounded-lg">
                        <p className="text-sm text-indigo-500 font-medium">MEMBERS</p>
                        <p className="text-3xl font-bold text-indigo-700">{selectedGroup.memberCount}</p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                         <p className="text-sm text-green-500 font-medium">CREATOR</p>
                        <p className="text-xl font-bold text-green-700">{selectedGroup.creatorName}</p>
                    </div>
                </div>

                <h3 className="text-2xl font-semibold text-gray-800 border-b pb-2 mb-4">Members List</h3>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                    {selectedGroup.members && selectedGroup.members.map((memberId, index) => (
                        <div key={index} className="flex items-center space-x-3 p-2 bg-gray-50 rounded-lg">
                            <span className="text-sm font-medium text-gray-700">{memberId.substring(0, 15)}...</span>
                            <span className="text-xs text-indigo-500"> (User ID)</span>
                        </div>
                    ))}
                </div>
                
                <div className="mt-8 text-center">
                    <button 
                         onClick={() => handleJoinLeaveGroup(selectedGroup.id, user && selectedGroup.members.includes(user.uid))}
                        className={`text-white px-8 py-3 rounded-full font-bold transition duration-150 shadow-lg ${user && selectedGroup.members.includes(user.uid) ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'}`}
                    >
                         {user && selectedGroup.members.includes(user.uid) ? 'Leave This Group' : 'Join This Group'}
                    </button>
                </div>
            </div>
        </div>
    );
    
    // Main Render Logic
    if (loading) {
        return <div className="flex items-center justify-center min-h-screen text-xl text-indigo-600">Loading App...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            <script src="https://cdn.tailwindcss.com"></script>
            <Header />
            <main>
                {/* Router based on currentView state */}
                {currentView === VIEWS.GROUP_LIST && <GroupListView />}
                {currentView === VIEWS.GROUP_DETAIL && selectedGroup && <GroupDetailView />}

                 <div className="fixed bottom-0 right-0 p-4 text-xs text-gray-500 bg-white border-t rounded-tl-lg shadow-inner">
                    <p>App ID: {firebaseConfig.appId.substring(0, 30)}...</p>
                </div>
            </main>
        </div>
    );
};

export default App;
