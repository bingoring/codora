// Simple test file to verify webview functionality
function testFunction() {
    const message = "Hello from Codora test function";
    console.log(message);
    return message;
}

class TestClass {
    constructor() {
        this.value = 42;
    }

    getValue() {
        return this.value;
    }
}

const instance = new TestClass();
console.log(instance.getValue());

// Export for testing
module.exports = { testFunction, TestClass };