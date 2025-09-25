// Sample TypeScript file for testing Codora extension
export class UserService {
    private users: User[] = [];

    /**
     * Adds a new user to the system
     * @param user User object to add
     * @returns The added user with generated ID
     */
    public addUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): User {
        const newUser: User = {
            ...user,
            id: this.generateId(),
            createdAt: new Date()
        };
        this.users.push(newUser);
        return newUser;
    }

    /**
     * Retrieves a user by their ID
     * @param id User ID to search for
     * @returns User if found, null otherwise
     */
    public getUserById(id: string): User | null {
        return this.users.find(user => user.id === id) || null;
    }

    /**
     * Updates an existing user's information
     * @param id User ID to update
     * @param updates Partial user data to update
     * @returns Updated user if found, null otherwise
     */
    public updateUser(id: string, updates: Partial<User>): User | null {
        const userIndex = this.users.findIndex(user => user.id === id);
        if (userIndex === -1) {
            return null;
        }

        this.users[userIndex] = {
            ...this.users[userIndex],
            ...updates,
            updatedAt: new Date()
        };

        return this.users[userIndex];
    }

    /**
     * Deletes a user from the system
     * @param id User ID to delete
     * @returns True if deleted, false if not found
     */
    public deleteUser(id: string): boolean {
        const initialLength = this.users.length;
        this.users = this.users.filter(user => user.id !== id);
        return this.users.length < initialLength;
    }

    /**
     * Gets all users with pagination
     * @param page Page number (1-based)
     * @param pageSize Number of users per page
     * @returns Paginated user list
     */
    public getUsers(page: number = 1, pageSize: number = 10): PaginatedResult<User> {
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedUsers = this.users.slice(startIndex, endIndex);

        return {
            data: paginatedUsers,
            page,
            pageSize,
            total: this.users.length,
            totalPages: Math.ceil(this.users.length / pageSize)
        };
    }

    /**
     * Generates a unique ID for a user
     * @returns Unique string ID
     */
    private generateId(): string {
        return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }
}

// Supporting interfaces
export interface User {
    id: string;
    name: string;
    email: string;
    age?: number;
    createdAt: Date;
    updatedAt?: Date;
}

export interface PaginatedResult<T> {
    data: T[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}

// Example usage
const userService = new UserService();

const newUser = userService.addUser({
    name: "John Doe",
    email: "john@example.com",
    age: 30
});

console.log("Created user:", newUser);

const foundUser = userService.getUserById(newUser.id);
console.log("Found user:", foundUser);