"use strict";
// Sample TypeScript file for testing 🗺️ Codora Explorer
class OrderService {
    constructor(paymentService) {
        this.paymentService = paymentService;
        this.taxRate = 0.08;
    }
    calculateTax(amount) {
        // This function calculates tax based on amount
        if (amount <= 0) {
            throw new Error('Amount must be positive');
        }
        return amount * this.taxRate;
    }
    processOrder(orderData) {
        // Process the complete order
        const validatedData = this.validateOrder(orderData);
        const tax = this.calculateTax(validatedData.amount);
        const total = validatedData.amount + tax;
        return {
            orderId: this.generateOrderId(),
            amount: validatedData.amount,
            tax: tax,
            total: total,
            status: 'processed'
        };
    }
    validateOrder(data) {
        if (!data.amount || data.amount <= 0) {
            throw new Error('Invalid order amount');
        }
        return data;
    }
    generateOrderId() {
        return 'ORDER_' + Date.now().toString();
    }
}
// Test the Codora functionality
function testCodoraExplorer() {
    // Hover over these function names to test 🗺️ Codora Explorer:
    // - calculateTax
    // - processOrder
    // - validateOrder
    // - OrderService (class)
    const paymentService = {
        processPayment: (amount) => amount > 0
    };
    const orderService = new OrderService(paymentService);
    const testOrder = {
        amount: 100,
        customerId: 'CUST_123',
        items: ['item1', 'item2']
    };
    try {
        const result = orderService.processOrder(testOrder);
        console.log('Order processed:', result);
    }
    catch (error) {
        console.error('Order processing failed:', error);
    }
}
//# sourceMappingURL=sample.js.map