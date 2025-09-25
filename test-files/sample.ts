// Sample TypeScript file for testing 🗺️ Codora Explorer

class OrderService {
    private taxRate = 0.08;

    constructor(private paymentService: PaymentService) {}

    calculateTax(amount: number): number {
        // This function calculates tax based on amount
        if (amount <= 0) {
            throw new Error('Amount must be positive');
        }
        return amount * this.taxRate;
    }

    processOrder(orderData: OrderData): OrderResult {
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

    private validateOrder(data: OrderData): OrderData {
        if (!data.amount || data.amount <= 0) {
            throw new Error('Invalid order amount');
        }
        return data;
    }

    private generateOrderId(): string {
        return 'ORDER_' + Date.now().toString();
    }
}

interface OrderData {
    amount: number;
    customerId: string;
    items: string[];
}

interface OrderResult {
    orderId: string;
    amount: number;
    tax: number;
    total: number;
    status: string;
}

interface PaymentService {
    processPayment(amount: number): boolean;
}

// Test the Codora functionality
function testCodoraExplorer() {
    // Hover over these function names to test 🗺️ Codora Explorer:
    // - calculateTax
    // - processOrder
    // - validateOrder
    // - OrderService (class)

    const paymentService: PaymentService = {
        processPayment: (amount: number) => amount > 0
    };

    const orderService = new OrderService(paymentService);

    const testOrder: OrderData = {
        amount: 100,
        customerId: 'CUST_123',
        items: ['item1', 'item2']
    };

    try {
        const result = orderService.processOrder(testOrder);
        console.log('Order processed:', result);
    } catch (error) {
        console.error('Order processing failed:', error);
    }
}