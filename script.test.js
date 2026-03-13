/**
 * @jest-environment jsdom
 */

// Mock Firebase globals before requiring the script
global.mockOnce = jest.fn();
global.mockSet = jest.fn();
global.mockRef = jest.fn(() => ({
  once: global.mockOnce,
  set: global.mockSet
}));

global.firebase = {
  initializeApp: jest.fn(() => ({})),
  database: jest.fn(() => ({
    ref: global.mockRef
  })),
  auth: {
    GoogleAuthProvider: jest.fn()
  }
};
global.firebase.auth = jest.fn(() => ({
    signInWithPopup: jest.fn(),
    signOut: jest.fn(),
    onAuthStateChanged: jest.fn()
}));
global.firebase.auth.GoogleAuthProvider = jest.fn();

const script = require('./script.js');

describe('script.js loadData and saveData tests', () => {
    beforeEach(() => {
        // Clear mocks before each test
        jest.clearAllMocks();
        
        // Reset internal data to some default structure
        script.setData({
            dresses: [],
            members: [],
            logs: [],
            appUsers: [],
            settings: { allowEditPlannedQty: false }
        });
    });

    it('should successfully load data from firebase', async () => {
        const testData = {
            dresses: [{ id: "d1", name: "Test Dress", budget: 100 }],
            members: [{ id: "m1", name: "Test Member" }],
            logs: [],
            appUsers: [],
            settings: { allowEditPlannedQty: false }
        };
        
        // Mock a snapshot object returning true for exists() and our testData
        global.mockOnce.mockResolvedValueOnce({
            exists: () => true,
            val: () => testData
        });

        await script.loadData();
        
        // Validate it fetched the specific ref correctly
        expect(global.mockRef).toHaveBeenCalledWith('/test');
        expect(global.mockOnce).toHaveBeenCalledWith('value');
        
        // Validate internal data was updated
        expect(script.getData()).toEqual(testData);
    });

    it('should fallback to existing data if no data exists in firebase', async () => {
        const initialData = script.getData();
        
        // Mock snapshot returning false for exists()
        global.mockOnce.mockResolvedValueOnce({
            exists: () => false,
            val: () => null
        });

        await script.loadData();
        
        expect(global.mockRef).toHaveBeenCalledWith('/test');
        expect(global.mockOnce).toHaveBeenCalledWith('value');
        
        // Should not have modified the initial state
        expect(script.getData()).toEqual(initialData);
    });

    it('should handle loadData errors internally without throwing', async () => {
        const initialData = script.getData();
        
        // Mock an error during fetch
        global.mockOnce.mockRejectedValueOnce(new Error("Network Error"));
        
        await expect(script.loadData()).resolves.not.toThrow();
        
        // Validate initialData remains unmutated
        expect(script.getData()).toEqual(initialData);
    });

    it('should successfully save data to firebase', async () => {
        const expectedData = script.getData();
        global.mockSet.mockResolvedValueOnce();
        
        await script.saveData();
        
        expect(global.mockRef).toHaveBeenCalledWith('/test');
        expect(global.mockSet).toHaveBeenCalledWith(expectedData);
    });

    it('should handle saveData errors internally without throwing', async () => {
        global.mockSet.mockRejectedValueOnce(new Error("Network Error"));
        
        await expect(script.saveData()).resolves.not.toThrow();
        
        expect(global.mockRef).toHaveBeenCalledWith('/test');
    });
});
