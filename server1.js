const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');

const app = express();
const port = 3001;

app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect("REPLACE_WITH_YOUR_OWN_MONGODB CONNECTION STRING") 
  .then(() => console.log("Connected to MongoDB"))
  
  .catch(err => console.log("Failed to connect to MongoDB", err));

// Define schemas
const studentSchema = new mongoose.Schema({
  fingerprintID: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  rollNumber: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  mobile: { type: String, required: true },
  parentName: { type: String, required: true },
  parentEmail: { type: String, required: true },
  address: { type: String, required: true },
});

const attendanceSchema = new mongoose.Schema({
  fingerprintID: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, enum: ['entry', 'exit'], required: true },
});

const unregisteredFingerprintSchema = new mongoose.Schema({
  fingerprintID: { type: Number, required: true, unique: true },
  timestamp: { type: Date, default: Date.now },
});

// Define models
const Student = mongoose.model('Student', studentSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);
const UnregisteredFingerprint = mongoose.model('UnregisteredFingerprint', unregisteredFingerprintSchema);

// Configure nodemailer for email notifications
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'youremal@gmail.com', // Replace with your email
    pass: 'use one time password instead of orignal which looks like: "sscc asca czxc sdcs"', // Replace with your email password
  },
});

// ✅ Endpoint to enroll a new fingerprint
app.post('/enroll', async (req, res) => {
  const { fingerprintID } = req.body;

  if (!fingerprintID || fingerprintID < 1 || fingerprintID > 127) {
    return res.status(400).json({ message: 'Invalid Fingerprint ID' });
  }

  try {
    // Check if the fingerprintID already exists in the students collection
    const existingStudent = await Student.findOne({ fingerprintID });
    if (existingStudent) {
      return res.status(400).json({ message: 'Fingerprint ID already exists' });
    }

    // Check if the fingerprintID already exists in the unregisteredFingerprint collection
    const existingRequest = await UnregisteredFingerprint.findOne({ fingerprintID });
    if (existingRequest) {
      return res.status(400).json({ message: 'Enrollment request already exists for this Fingerprint ID' });
    }

    // If fingerprintID is unique, save the enrollment request
    const newFingerprint = new UnregisteredFingerprint({ fingerprintID });
    await newFingerprint.save();
    console.log(`Enrollment initiated for Fingerprint ID: ${fingerprintID}`);
    res.status(201).json({ message: 'Fingerprint enrollment initiated', fingerprintID });
  } catch (err) {
    console.error('Failed to enroll fingerprint:', err);
    res.status(500).json({ message: 'Failed to enroll fingerprint' });
  }
});

// ✅ Endpoint to check for pending enrollment requests
app.get('/check-enrollment-requests', async (req, res) => {
  try {
    const pendingRequest = await UnregisteredFingerprint.findOne().sort({ timestamp: 1 });
    if (pendingRequest) {
      await UnregisteredFingerprint.deleteOne({ _id: pendingRequest._id }); // Remove the request after processing
      console.log(`Processing enrollment request for Fingerprint ID: ${pendingRequest.fingerprintID}`);
      res.status(200).json({ fingerprintID: pendingRequest.fingerprintID });
    } else {
      res.status(404).json({ message: 'No pending enrollment requests' });
    }
  } catch (err) {
    console.error('Failed to fetch enrollment requests:', err);
    res.status(500).json({ message: 'Failed to fetch enrollment requests' });
  }
});

// ✅ Endpoint to register a student
app.post('/register-student', async (req, res) => {
  const { fingerprintID, name, rollNumber, email, mobile, parentName, parentEmail, address } = req.body;

  try {
    // Check if the fingerprintID already exists
    const existingStudent = await Student.findOne({ fingerprintID });
    if (existingStudent) {
      return res.status(400).json({ message: 'Fingerprint ID already exists' });
    }

    // If fingerprintID is unique, save the student
    const student = new Student({ fingerprintID, name, rollNumber, email, mobile, parentName, parentEmail, address });
    await student.save();
    console.log(`Student registered with Fingerprint ID: ${fingerprintID}`);
    res.status(201).json({ message: 'Student registered successfully' });
  } catch (err) {
    if (err.code === 11000) { // Duplicate key error
      console.error('Duplicate Fingerprint ID:', err.keyValue);
      return res.status(400).json({ message: 'Fingerprint ID already exists' });
    }
    console.error('Failed to register student:', err);
    res.status(500).json({ message: 'Failed to register student' });
  }
});

// ✅ Endpoint to handle attendance
app.post('/attendance', async (req, res) => {
  const { fingerprintID } = req.body;

  try {
    const student = await Student.findOne({ fingerprintID });
    if (!student) {
      console.log(`Unregistered Fingerprint Detected: ${fingerprintID}`);
      return res.status(403).json({ message: 'Not Allowed', fingerprintID });
    }

    const newAttendance = new Attendance({ fingerprintID, status: 'entry' });
    await newAttendance.save();
    sendEmail(student); // Send email to parent
    console.log(`Attendance marked for Fingerprint ID: ${fingerprintID}`);
    res.status(200).json({ message: 'Attendance marked', student });
  } catch (err) {
    console.error('Failed to mark attendance:', err);
    res.status(500).json({ message: 'Failed to mark attendance' });
  }
});

// ✅ Endpoint to fetch all students
app.get('/students', async (req, res) => {
  try {
    const students = await Student.find();
    res.status(200).json(students);
  } catch (err) {
    console.error('Failed to fetch students:', err);
    res.status(500).json({ message: 'Failed to fetch students' });
  }
});

// ✅ Endpoint to fetch attendance records for a student
app.get('/attendance/:fingerprintID', async (req, res) => {
  const { fingerprintID } = req.params;

  try {
    const attendanceRecords = await Attendance.find({ fingerprintID }).sort({ timestamp: -1 });
    res.status(200).json(attendanceRecords);
  } catch (err) {
    console.error('Failed to fetch attendance records:', err);
    res.status(500).json({ message: 'Failed to fetch attendance records' });
  }
});




// ✅ Function to send email
const sendEmail = (student) => {
  const mailOptions = {
    from: 'thecommunitylink3@gmail.com', // Replace with your email
    to: student.parentEmail, // Parent's email from student record
    subject: 'Student Attendance Notification',
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #007AFF; text-align: center;">Student Attendance Notification</h2>
        <p>Dear ${student.parentName},</p>
        <p>This is to inform you that your child, <strong>${student.name}</strong>, has marked their attendance.</p>
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; margin-top: 20px;">
          <p><strong>Student Details:</strong></p>
          <ul style="list-style-type: none; padding: 0;">
            <li><strong>Name:</strong> ${student.name}</li>
            <li><strong>Roll No:</strong> ${student.rollNumber}</li>
            <li><strong>Time:</strong> ${new Date().toLocaleString()}</li>
          </ul>
        </div>
        <p style="margin-top: 20px;">If you have any questions or concerns, please feel free to contact us.</p>
        <p>Best regards,</p>
        <p><strong>The Community Link Team</strong></p>
        <p style="font-size: 12px; color: #777; text-align: center; margin-top: 20px;">
          This is an automated email. Please do not reply directly to this message.
        </p>
      </div>
    `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log('Email error:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });
};

app.get('/students', async (req, res) => {
  try {
    const students = await Student.find();
    res.status(200).json(students);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch students' });
  }
});

app.delete('/students/:fingerprintID', async (req, res) => {
  const { fingerprintID } = req.params;

  try {
    await Student.deleteOne({ fingerprintID });
    res.status(200).json({ message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete student' });
  }
});

app.put('/students/:fingerprintID', async (req, res) => {
  const { fingerprintID } = req.params;
  const updatedData = req.body;

  try {
    const student = await Student.findOneAndUpdate(
      { fingerprintID }, // Find the student by fingerprintID
      updatedData,       // Update with the new data
      { new: true }      // Return the updated document
    );

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.status(200).json(student);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update student' });
  }
});


app.delete('/students/:fingerprintID', async (req, res) => {
  const { fingerprintID } = req.params;

  try {
    await Student.deleteOne({ fingerprintID });
    res.status(200).json({ message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete student' });
  }
});
app.get('/attendance', async (req, res) => {
  try {
    const attendanceLogs = await Attendance.find().sort({ timestamp: -1 }); // Sort by latest first
    res.status(200).json(attendanceLogs);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch attendance logs' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});