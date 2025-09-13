import express from 'express';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { pdfFieldMapS2, pdfFieldMapS3, pdfFieldMapC1 } from './fieldMap.js';
import cors from 'cors';

const app = express();
app.use(express.json()); // parse JSON body
app.use(cors()); // enable CORS for all origins
const outputDir = path.join('.', 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

async function generatePdf(data, useTestData = false) {
    let pdfFieldMap;
    if (data.rating === 'S2') pdfFieldMap = pdfFieldMapS2;
    else if (data.rating === 'S3') pdfFieldMap = pdfFieldMapS3;
    else if (data.rating === "C1") pdfFieldMap = pdfFieldMapC1;
    else pdfFieldMap = {}; // fallback
    
    const templatePath = path.join('.', 'templates', `${data.rating}.pdf`);
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // If using test data, merge it in
    let finalData = data;
    finalData.vaccName = finalData.vaccName || 'VATITA';

    console.log(finalData)

    if(finalData.facilityTwr.length > 27) {
        finalData.facilityTwr = finalData.facilityTwr.split(" - ")[1].trim();
    }
    //⚠️ Could not fill field: reqKey="local_examiners", pdfKey="local_examiners", value="[{"name":"Giacomo Marcetta","id":"1487920","rating":"S3"},{"name":"Gennaro DeLuca","id":"15068
    /*
    map to 
        examinerName1: 'Name Examiner Local 1',
    examinerCid1: 'CID Examiner  Local 1',
    examinerRating1: 'Rating Examiner 1  Local 1',
    examinerName2: 'Name Examiner Local 2',
    examinerCid2: 'CID Examiner  Local 2',
    examinerRating2: 'Rating Examiner 2  Local 2',
    */
    if (finalData.local_examiners) {
        try {
            const locals = (finalData.local_examiners);
            if (Array.isArray(locals)) {
                if (locals[0]) {
                    finalData.examinerName1 = locals[0].name || '';
                    finalData.examinerCid1 = locals[0].id || '';
                    finalData.examinerRating1 = locals[0].rating || '';
                }
                if (locals[1]) {
                    finalData.examinerName2 = locals[1].name || '';
                    finalData.examinerCid2 = locals[1].id || '';
                    finalData.examinerRating2 = locals[1].rating || '';
                }
            }
            console.log(finalData)
        } catch (e) {
            console.warn('⚠️ Could not parse local_examiners JSON:', e);
        }
    }
    console.log(finalData)
    delete finalData.local_examiners;
    
    // Fill PDF fields based on mapping or direct PDF key if no mapping
    for (const [reqKey, value] of Object.entries(finalData)) {
    const pdfKey = pdfFieldMap[reqKey] || reqKey;
    if (!value) continue;

    let filled = false;
    
    try {
        form.getTextField(pdfKey).setText(value);
        filled = true;
    } catch {}

    if (!filled) {
        try {
            form.getDropdown(pdfKey).select(value);
            filled = true;
        } catch {}
    }

    if (!filled) {
        try {
            const checkbox = form.getCheckBox(pdfKey);
            if (value) checkbox.check(); else checkbox.uncheck();
            filled = true;
        } catch {}
    }

    if (!filled) {
        try {
            const radio = form.getRadioGroup(pdfKey);
            radio.select(value);
            filled = true;
        } catch {}
    }

    if (!filled) {
        console.warn(`⚠️ Could not fill field: reqKey="${reqKey}", pdfKey="${pdfKey}", value="${value}"`);
    }
}


    form.flatten();
    const pdfBytes = await pdfDoc.save();
    const outputPath = path.join(outputDir, 'exam_report.pdf');
    fs.writeFileSync(outputPath, pdfBytes);

    return { pdfBytes, outputPath };
}

const testData = {
    'vACC Name': 'VATITA',
    'Examinee Information': 'John Doe',
    'Examinee CID': '12345',
    'Name Examiner': 'John Doe',
    'CID Examiner': '54321',
    'Rating Examiner 2': 'C1',
    'Facility - ICAO_TWR': 'Linate Tower - LIML_TWR',
    "Session Date": '2025-09-07',
    'Start Time': '14:00',
    'End Time': '15:00',
    'Session was performed': 'Online',
    'Complexity': 'High',
    'Workload': 'High',
    'Traffic Load': 'High',
    'Examinee': 'Passed',
    'Correctly Connects to the Network': 'N/A',
    'Understans the Role and Responsability': 'N/A',
    'Demonstrate correct use of the Software': 'N/A',
    'Demonstrate professional behaviour': 'N/A',
    'Selects a suitable runway configuration and generates ATIS Issues appropriate clearance and departure instructions': 'S',
    'Issues appropriate clearance and departure instructions': 'N/A',
    'Issues appropriate ground movement clearances': 'N/A',
    'Issues appropriate Take-off/Landing clearances': 'N/A',
    'Correctly handles missed approaches': 'N/A',
    'Manages VFR traffic correctly': 'N/A',
    'Provides traffic information when suitable and appropriate': 'N/A',
    'Demonstrates situational awareness and frequency management': 'N/A',
    'Knows and applies procedures and agreements correctly': 'N/A',
    'Demonstrates the use of appropriate phraseology': 'N/A',
    'Correctly manages communication priority': 'N/A',
    'Performs the required coordination': 'N/A',
    'Correctly takes over and hands over the position': 'N/A',
    'General Comments': 'Well done!',
    'ATC Comments': 'Keep it up!',
    'Communication Comments': 'Excellent!',
    'Final Review': 'All good!',
};

function mapToPdfFields(data = {}) {
    const mapped = {};
    for (const [shortKey, value] of Object.entries(data)) {
        if (pdfFieldMap[shortKey]) {
            mapped[pdfFieldMap[shortKey]] = value;
        }
    }
    return mapped;
}

app.get('/pdf/human', async (req, res) => {
    try {
        // Use the test data directly but map it so fields match PDF names
        const mappedData = { ...testData, ...mapToPdfFields(testData) };
        const { outputPath } = await generatePdf(mappedData);
        res.sendFile(path.resolve(outputPath));
    } catch (err) {
        console.error(err);
        res.status(500).send('Error generating PDF');
    }
});

app.get('/pdf/test', async (req, res) => {
    try {
        const templatePath = path.join('.', 'templates', 'c1.pdf');
        const templateBytes = fs.readFileSync(templatePath);
        const pdfDoc = await PDFDocument.load(templateBytes);
        const form = pdfDoc.getForm();
        const fields = form.getFields();

        // Extract readable info
        const fieldInfo = fields.map(f => {
          const type = f.constructor.name; // e.g., PDFTextField, PDFCheckBox
          const name = f.getName();
          return { name, type };
        });

        res.json(fieldInfo);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error generating PDF');
    }
});


// Human endpoint → sends PDF
app.post('/pdf/human', async (req, res) => {
    try {
        let data = req.body;
        const { outputPath } = await generatePdf(data);
        res.sendFile(path.resolve(outputPath));
    } catch (err) {
        console.error(err);
        res.status(500).send('Error generating PDF');
    }
});

// Non-human endpoint → returns base64
app.post('/pdf/json', async (req, res) => {
    try {
        let data = req.body.json;
        const { pdfBytes } = await generatePdf(data);
        res.json({ pdfBase64: pdfBytes.toString('base64') });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error generating PDF' });
    }
});

app.listen(3001, () => console.log('PDF API running on port 3001'));
