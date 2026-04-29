const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'db_config.json'), 'utf8'));

async function initDatabase() {
    const connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database
    });

    // 创建客户表
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS customers (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(100) NOT NULL COMMENT '客户姓名',
            company VARCHAR(200) COMMENT '公司名称',
            phone VARCHAR(50) COMMENT '联系电话',
            email VARCHAR(100) COMMENT '邮箱',
            address VARCHAR(300) COMMENT '地址',
            industry VARCHAR(100) COMMENT '行业',
            status ENUM('potential', 'active', 'inactive', 'lost') DEFAULT 'potential' COMMENT '客户状态',
            source VARCHAR(100) COMMENT '客户来源',
            remark TEXT COMMENT '备注',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_status (status),
            INDEX idx_industry (industry),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户信息表'
    `);

    // 创建拜访记录表
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS visits (
            id INT PRIMARY KEY AUTO_INCREMENT,
            customer_id INT NOT NULL COMMENT '客户ID',
            visit_date DATE NOT NULL COMMENT '拜访日期',
            visit_type ENUM('visit', 'phone', 'email', 'meeting', 'other') DEFAULT 'visit' COMMENT '拜访类型',
            content TEXT COMMENT '拜访内容',
            result TEXT COMMENT '拜访结果',
            next_plan TEXT COMMENT '下一步计划',
            sales_person VARCHAR(100) COMMENT '销售人员',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
            INDEX idx_customer (customer_id),
            INDEX idx_date (visit_date),
            INDEX idx_sales (sales_person)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户拜访记录表'
    `);

    // 插入示例数据
    const [existing] = await connection.execute('SELECT COUNT(*) as count FROM customers');
    if (existing[0].count === 0) {
        await connection.execute(`
            INSERT INTO customers (name, company, phone, email, industry, status, source, remark) VALUES
            ('张三', 'ABC科技有限公司', '13800138001', 'zhangsan@abc.com', '互联网', 'active', '官网注册', '重点客户，需求明确'),
            ('李四', 'XYZ贸易公司', '13900139002', 'lisi@xyz.com', '贸易', 'potential', '展会', '对产品感兴趣'),
            ('王五', '123制造厂', '13700137003', 'wangwu@123.com', '制造业', 'active', '电话营销', '已签约'),
            ('赵六', 'DEF咨询公司', '13600136004', 'zhaoliu@def.com', '咨询', 'potential', '转介绍', '需要跟进'),
            ('钱七', 'GHI教育集团', '13500135005', 'qianqi@ghi.com', '教育', 'inactive', '官网注册', '暂时不需要'),
            ('孙八', 'JKL物流公司', '13400134006', 'sunba@jkl.com', '物流', 'active', '地推', '合作中'),
            ('周九', 'MNO医疗科技', '13300133007', 'zhoujiu@mno.com', '医疗', 'potential', '展会', '有采购计划'),
            ('吴十', 'PQR建筑设计', '13200132008', 'wushi@pqr.com', '建筑', 'lost', '电话营销', '选择了竞品')
        `);

        await connection.execute(`
            INSERT INTO visits (customer_id, visit_date, visit_type, content, result, next_plan, sales_person) VALUES
            (1, '2026-04-15', 'visit', '拜访ABC科技，介绍新产品功能', '客户很感兴趣，要求提供报价', '发送报价单并跟进', '销售A'),
            (1, '2026-04-20', 'phone', '电话跟进报价情况', '客户对价格有异议，需要调整', '重新调整报价方案', '销售A'),
            (2, '2026-04-10', 'meeting', '展会现场交流', '收集到客户需求清单', '发送产品资料', '销售B'),
            (3, '2026-04-01', 'visit', '上门拜访，签约合同', '成功签约，金额50万', '安排交付团队进场', '销售A'),
            (3, '2026-04-18', 'phone', '回访客户使用情况', '客户反馈良好，有追加需求', '安排技术对接', '销售A'),
            (4, '2026-04-12', 'email', '发送产品资料邮件', '客户已查看资料', '安排演示', '销售B'),
            (6, '2026-04-08', 'visit', '拜访JKL物流，了解需求', '达成合作意向', '起草合作协议', '销售C'),
            (7, '2026-04-22', 'phone', '电话沟通采购计划', '客户预计Q3采购', '定期跟进', '销售B')
        `);
    }

    await connection.end();
    console.log('✅ 数据库初始化完成');
}

initDatabase().catch(console.error);
