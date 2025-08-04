require('dotenv').config();
const express = require('express');
const axios = require('axios');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// MySQL Database Configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'medication_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Create MySQL connection pool
const pool = mysql.createPool(dbConfig);
const promisePool = pool.promise();

// Create database and table if they don't exist
async function initializeDatabase() {
    try {
        // Create database if it doesn't exist
        const connection = mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password
        });

        await connection.promise().query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
        await connection.promise().end();

        // Create table if it doesn't exist
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS f_medications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name TEXT NOT NULL,
                synonym TEXT,
                rxcui VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_rxcui (rxcui)
            )
        `);

        console.log('Database and table initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
        process.exit(1);
    }
}

// Initialize database on startup
initializeDatabase();

// Routes
app.get('/', (req, res) => {
    res.render('index', { medications: null, error: null, success: null });
});

// Search medications
app.post('/search', async (req, res) => {
    const { medicationName } = req.body;
    
    if (!medicationName) {
        return res.render('index', { 
            medications: null, 
            error: 'Please enter a medication name', 
            success: null 
        });
    }

    try {
        const response = await axios.get(`https://rxnav.nlm.nih.gov/REST/Prescribe/drugs.json?name=${encodeURIComponent(medicationName)}`);
        
        const drugGroup = response.data.drugGroup;
        let medications = [];

        // if (drugGroup && drugGroup.conceptGroup) {
        //     // Find SBD concept group
        //     const sbdGroup = drugGroup.conceptGroup.find(group => group.tty === 'SBD');
            
        //     if (sbdGroup && sbdGroup.conceptProperties) {
        //         medications = sbdGroup.conceptProperties.map(med => ({
        //             rxcui: med.rxcui,
        //             name: med.name,
        //             synonym: med.synonym
        //         }));
        //     }
        // }
        if (drugGroup && drugGroup.conceptGroup) {
            // Filter for both SBD and SCD concept groups
            const relevantGroups = drugGroup.conceptGroup.filter(group =>
                group.tty === 'SBD' || group.tty === 'SCD'
            );

            medications = [];

            // Loop through relevant groups and extract medications
            relevantGroups.forEach(group => {
                if (group.conceptProperties) {
                    medications.push(
                        ...group.conceptProperties.map(med => ({
                            rxcui: med.rxcui,
                            name: med.name,
                            synonym: med.synonym
                        }))
                    );
                }
            });
        }

        if (medications.length === 0) {
            return res.render('index', { 
                medications: null, 
                error: 'No medications found. Please try a different search term.', 
                success: null 
            });
        }

        res.render('index', { 
            medications: medications, 
            error: null, 
            success: null 
        });

    } catch (error) {
        console.error('Error fetching medication data:', error);
        res.render('index', { 
            medications: null, 
            error: 'Error fetching medication data. Please try again.', 
            success: null 
        });
    }
});

// Save multiple medications to database
app.post('/save_multiple', async (req, res) => {
    const { medications } = req.body;
    console.log('Received medications:', medications);

    if (!medications || !Array.isArray(medications) || medications.length === 0) {
        return res.json({ success: false, message: 'No medications provided' });
    }

    try {
        let savedCount = 0;
        let skippedCount = 0;
        const errors = [];

        for (const med of medications) {
            const { rxcui, name, synonym } = med;

            if (!rxcui || !name) {
                errors.push(`Missing required fields for medication: ${name || rxcui}`);
                continue;
            }

            try {
                // Check if medication already exists
                const [existingRows] = await promisePool.execute(
                    'SELECT * FROM f_medications WHERE rxcui = ?', 
                    [rxcui]
                );

                if (existingRows.length > 0) {
                    skippedCount++;
                    continue;
                }

                const finalSynonym = synonym || name;

                await promisePool.execute(
                        'INSERT INTO f_medications (name, synonym, rxcui) VALUES (?, ?, ?)', 
                        [name, finalSynonym, rxcui]
                    );

                // if (!synonym) {
                //     // Insert new medication
                //     await promisePool.execute(
                //         'INSERT INTO f_medications (name, synonym, rxcui) VALUES (?, ?, ?)', 
                //         [name, name, rxcui]
                //     );
                // } else {
                //      await promisePool.execute(
                //         'INSERT INTO f_medications (name, synonym, rxcui) VALUES (?, ?, ?)', 
                //         [name, synonym, rxcui]
                //     );
                // }
                

                savedCount++;
            } catch (error) {
                console.error(`Error saving medication ${rxcui}:`, error);
                errors.push(`Failed to save medication: ${name}`);
            }
        }

        if (savedCount === 0 && skippedCount === 0) {
            return res.json({ 
                success: false, 
                message: 'No medications were saved. ' + (errors.length > 0 ? errors.join(', ') : '')
            });
        }

        res.json({ 
            success: true, 
            message: `Operation completed successfully`,
            savedCount: savedCount,
            skippedCount: skippedCount,
            errors: errors
        });

    } catch (error) {
        console.error('Error saving multiple medications:', error);
        res.json({ success: false, message: 'Error saving medications' });
    }
});

// Save medication to database
app.post('/save', async (req, res) => {
    const { rxcui, name, synonym } = req.body;

    if (!rxcui || !name) {
        return res.json({ success: false, message: 'Missing required fields' });
    }

    try {
        // Check if medication already exists
        const [existingRows] = await promisePool.execute(
            'SELECT * FROM f_medications WHERE rxcui = ?', 
            [rxcui]
        );

        if (existingRows.length > 0) {
            return res.json({ success: false, message: 'Medication already exists in database' });
        }

        const finalSynonym = synonym || name;

        const [result] = await promisePool.execute(
                'INSERT INTO f_medications (name, synonym, rxcui) VALUES (?, ?, ?)', 
                [name, finalSynonym, rxcui]
            );

        // if (!synonym) {
           
        // } else {
        //     // Insert new medication
        //     const [result] = await promisePool.execute(
        //         'INSERT INTO f_medications (name, synonym, rxcui) VALUES (?, ?, ?)', 
        //         [name, synonym, rxcui]
        //     );
        // }

        res.json({ 
            success: true, 
            message: 'Medication saved successfully',
            id: result.insertId
        });

    } catch (error) {
        console.error('Error saving medication:', error);
        res.json({ success: false, message: 'Error saving medication' });
    }
});

// View saved medications
app.get('/saved', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let queryParams = [];

        if (search) {
            whereClause = 'WHERE name LIKE ? OR synonym LIKE ? OR rxcui LIKE ?';
            const searchTerm = `%${search}%`;
            queryParams = [searchTerm, searchTerm, searchTerm];
        }

        // Get total count for pagination
        const [countResult] = await promisePool.execute(
            `SELECT COUNT(*) as total FROM f_medications ${whereClause}`,
            queryParams
        );
        const totalRecords = countResult[0].total;
        const totalPages = Math.ceil(totalRecords / limit);

        // Get paginated results
        const [rows] = await promisePool.execute(
            `SELECT * FROM f_medications ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [...queryParams, limit, offset]
        );

        const pagination = {
            currentPage: page,
            totalPages: totalPages,
            totalRecords: totalRecords,
            limit: limit,
            hasNext: page < totalPages,
            hasPrev: page > 1,
            nextPage: page + 1,
            prevPage: page - 1
        };

        res.render('saved', { 
            medications: rows, 
            error: null, 
            pagination: pagination,
            search: search
        });
    } catch (error) {
        console.error('Database error:', error);
        res.render('saved', { 
            medications: [], 
            error: 'Error loading saved medications',
            pagination: {
                currentPage: 1,
                totalPages: 0,
                totalRecords: 0,
                limit: 10,
                hasNext: false,
                hasPrev: false
            },
            search: ''
        });
    }
});

// app.get('/saved', async (req, res) => {
//     try {
//         const [rows] = await promisePool.execute(
//             'SELECT * FROM f_medications ORDER BY created_at DESC'
//         );

//         res.render('saved', { medications: rows, error: null });
//     } catch (error) {
//         console.error('Database error:', error);
//         res.render('saved', { medications: [], error: 'Error loading saved medications' });
//     }
// });

// Delete medication
app.post('/delete/:id', async (req, res) => {
    const id = req.params.id;
    
    try {
        const [result] = await promisePool.execute(
            'DELETE FROM f_medications WHERE id = ?', 
            [id]
        );

        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Medication deleted successfully' });
        } else {
            res.json({ success: false, message: 'Medication not found' });
        }
    } catch (error) {
        console.error('Error deleting medication:', error);
        res.json({ success: false, message: 'Error deleting medication' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to access the application`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    try {
        await pool.end();
        console.log('MySQL connection pool closed');
    } catch (error) {
        console.error('Error closing MySQL connection pool:', error);
    } finally {
        process.exit(0);
    }
});