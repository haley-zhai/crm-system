const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3002;

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'db_config.json'), 'utf8'));

let pool;
async function initPool() {
    pool = mysql.createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    console.log('✅ 数据库连接池已创建');
}

// 中间件
app.use(cors({
    origin: ['http://localhost:8080', 'http://localhost:3000', 'https://haley-zhai.github.io', 'null', 'file://', '*'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// ========== 客户管理 API ==========

// 获取客户列表（支持搜索和筛选）
app.get('/api/customers', async (req, res) => {
    try {
        const { keyword, status, industry, page = 1, pageSize = 20 } = req.query;
        let where = 'WHERE 1=1';
        const params = [];

        if (keyword) {
            where += ' AND (name LIKE ? OR company LIKE ? OR phone LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }
        if (status) {
            where += ' AND status = ?';
            params.push(status);
        }
        if (industry) {
            where += ' AND industry = ?';
            params.push(industry);
        }

        // 获取总数
        const [countResult] = await pool.execute(`SELECT COUNT(*) as total FROM customers ${where}`, params);
        const total = countResult[0].total;

        // 获取分页数据
        const offset = (parseInt(page) - 1) * parseInt(pageSize);
        const [rows] = await pool.execute(
            `SELECT c.*, COUNT(v.id) as visit_count 
             FROM customers c 
             LEFT JOIN visits v ON c.id = v.customer_id 
             ${where} 
             GROUP BY c.id 
             ORDER BY c.updated_at DESC 
             LIMIT ? OFFSET ?`,
            [...params, parseInt(pageSize), offset]
        );

        res.json({ success: true, data: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) });
    } catch (e) {
        console.error('获取客户列表失败', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 获取客户详情
app.get('/api/customers/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM customers WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, error: '客户不存在' });
        res.json({ success: true, data: rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 创建客户
app.post('/api/customers', async (req, res) => {
    try {
        const { name, company, phone, email, address, industry, status, source, remark } = req.body;
        if (!name) return res.status(400).json({ success: false, error: '客户姓名必填' });

        const [result] = await pool.execute(
            `INSERT INTO customers (name, company, phone, email, address, industry, status, source, remark) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, company, phone, email, address, industry, status || 'potential', source, remark]
        );

        res.json({ success: true, data: { id: result.insertId } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 更新客户
app.put('/api/customers/:id', async (req, res) => {
    try {
        const { name, company, phone, email, address, industry, status, source, remark } = req.body;
        await pool.execute(
            `UPDATE customers SET name=?, company=?, phone=?, email=?, address=?, industry=?, status=?, source=?, remark=? WHERE id=?`,
            [name, company, phone, email, address, industry, status, source, remark, req.params.id]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 删除客户
app.delete('/api/customers/:id', async (req, res) => {
    try {
        await pool.execute('DELETE FROM customers WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========== 拜访记录 API ==========

// 获取拜访记录列表
app.get('/api/visits', async (req, res) => {
    try {
        const { customer_id, start_date, end_date, sales_person, page = 1, pageSize = 20 } = req.query;
        let where = 'WHERE 1=1';
        const params = [];

        if (customer_id) {
            where += ' AND v.customer_id = ?';
            params.push(customer_id);
        }
        if (start_date) {
            where += ' AND v.visit_date >= ?';
            params.push(start_date);
        }
        if (end_date) {
            where += ' AND v.visit_date <= ?';
            params.push(end_date);
        }
        if (sales_person) {
            where += ' AND v.sales_person = ?';
            params.push(sales_person);
        }

        const offset = (parseInt(page) - 1) * parseInt(pageSize);
        const [rows] = await pool.execute(
            `SELECT v.*, c.name as customer_name, c.company 
             FROM visits v 
             JOIN customers c ON v.customer_id = c.id 
             ${where} 
             ORDER BY v.visit_date DESC 
             LIMIT ? OFFSET ?`,
            [...params, parseInt(pageSize), offset]
        );

        const [countResult] = await pool.execute(
            `SELECT COUNT(*) as total FROM visits v ${where}`,
            params
        );

        res.json({ success: true, data: rows, total: countResult[0].total });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 创建拜访记录
app.post('/api/visits', async (req, res) => {
    try {
        const { customer_id, visit_date, visit_type, content, result, next_plan, sales_person } = req.body;
        if (!customer_id || !visit_date) {
            return res.status(400).json({ success: false, error: '客户ID和拜访日期必填' });
        }

        const [result2] = await pool.execute(
            `INSERT INTO visits (customer_id, visit_date, visit_type, content, result, next_plan, sales_person) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [customer_id, visit_date, visit_type || 'visit', content, result, next_plan, sales_person]
        );

        res.json({ success: true, data: { id: result2.insertId } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 更新拜访记录
app.put('/api/visits/:id', async (req, res) => {
    try {
        const { visit_date, visit_type, content, result, next_plan, sales_person } = req.body;
        await pool.execute(
            `UPDATE visits SET visit_date=?, visit_type=?, content=?, result=?, next_plan=?, sales_person=? WHERE id=?`,
            [visit_date, visit_type, content, result, next_plan, sales_person, req.params.id]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 删除拜访记录
app.delete('/api/visits/:id', async (req, res) => {
    try {
        await pool.execute('DELETE FROM visits WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========== 统计报表 API ==========

// 仪表盘统计数据
app.get('/api/dashboard', async (req, res) => {
    try {
        // 客户统计
        const [customerStats] = await pool.execute(`
            SELECT 
                COUNT(*) as total_customers,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_customers,
                SUM(CASE WHEN status = 'potential' THEN 1 ELSE 0 END) as potential_customers,
                SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive_customers,
                SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost_customers
            FROM customers
        `);

        // 本月新增客户
        const [newCustomers] = await pool.execute(`
            SELECT COUNT(*) as count FROM customers 
            WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        `);

        // 本月拜访次数
        const [monthlyVisits] = await pool.execute(`
            SELECT COUNT(*) as count FROM visits 
            WHERE visit_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        `);

        // 行业分布
        const [industryDist] = await pool.execute(`
            SELECT industry, COUNT(*) as count 
            FROM customers 
            WHERE industry IS NOT NULL AND industry != ''
            GROUP BY industry 
            ORDER BY count DESC
        `);

        // 客户状态分布
        const [statusDist] = await pool.execute(`
            SELECT status, COUNT(*) as count 
            FROM customers 
            GROUP BY status
        `);

        // 月度拜访趋势（最近6个月）
        const [monthlyTrend] = await pool.execute(`
            SELECT 
                DATE_FORMAT(visit_date, '%Y-%m') as month,
                COUNT(*) as count
            FROM visits
            WHERE visit_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(visit_date, '%Y-%m')
            ORDER BY month
        `);

        // 销售人员拜访统计
        const [salesStats] = await pool.execute(`
            SELECT 
                sales_person,
                COUNT(*) as visit_count,
                COUNT(DISTINCT customer_id) as customer_count
            FROM visits
            WHERE sales_person IS NOT NULL AND sales_person != ''
            GROUP BY sales_person
            ORDER BY visit_count DESC
        `);

        res.json({
            success: true,
            data: {
                customerStats: customerStats[0],
                newCustomers: newCustomers[0].count,
                monthlyVisits: monthlyVisits[0].count,
                industryDistribution: industryDist,
                statusDistribution: statusDist,
                monthlyTrends,
                salesStats
            }
        });
    } catch (e) {
        console.error('仪表盘统计失败', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// 销售人员拜访统计（独立接口，供统计报表页面使用）
app.get('/api/statistics/sales', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT 
                sales_person,
                COUNT(*) as visit_count,
                COUNT(DISTINCT customer_id) as customer_count
            FROM visits
            WHERE sales_person IS NOT NULL AND sales_person != ''
            GROUP BY sales_person
            ORDER BY visit_count DESC
        `);
        res.json({ success: true, data: rows });
    } catch (e) {
        console.error('获取销售统计失败', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 启动服务
initPool().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 CRM API 服务运行在 http://0.0.0.0:${PORT}`);
    });
}).catch(err => {
    console.error('启动失败', err);
    process.exit(1);
});
