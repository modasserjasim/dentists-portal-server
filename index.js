const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
require('colors');
const app = express();
const port = process.env.PORT || 3500;

//Middle wares
app.use(cors());
app.use(express.json());

// configure MongoDB

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vqm0pbr.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    console.log({ authHeader });
    if (!authHeader) {
        return res.status(401).send('Unauthorized access');
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {
    try {
        await client.connect();
        console.log('Database Connected'.yellow);
    } catch (error) {
        console.log(error.name.bgRed, error.message.bold, error.stack);
    }
}
run();

const treatmentCollection = client.db('DentistsPortal').collection('treatments');
const bookingCollection = client.db('DentistsPortal').collection('bookings');
const userCollection = client.db('DentistsPortal').collection('users');
const doctorsCollection = client.db('DentistsPortal').collection('doctors');

app.get('/jwt', async (req, res) => {
    const email = req.query.email;

    const user = await userCollection.findOne({ email: email });
    if (user) {
        var token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '10d' });
        return res.send({ accessToken: token });
    }
    // console.log(user);
    res.status(403).send({ accessToken: '' });
})
// use aggregate to query multiple collection and then merge data
app.get('/treatments', async (req, res) => {
    try {
        const date = req.query.date;
        // console.log(date);
        const cursor = treatmentCollection.find({});
        const treatments = await cursor.toArray();

        //get the bookings of the provided date
        const bookingQuery = { appointmentDate: date };
        const alreadyBooked = await bookingCollection.find(bookingQuery).toArray();

        treatments.forEach(treatment => {
            const treatmentBooked = alreadyBooked.filter(book => book.treatmentName === treatment.name)
            const bookedSlots = treatmentBooked.map(book => book.AppointmentTime);
            const remainingSlots = treatment.slots.filter(slot => !bookedSlots.includes(slot));
            treatment.slots = remainingSlots;
            // console.log(date, treatment.name, remainingSlots.length);
        })

        res.send(treatments)
        // res.send({
        //     status: true,
        //     treatments: treatments
        // })
    } catch (error) {
        console.log(error.name.bgRed, error.message.bold);
        res.send({
            status: false,
            error: error.message
        })

    }
})

// MongoDB aggregate project pipeline (optional for Junior dev)
app.get('/v2/treatments', async (req, res) => {
    try {
        const date = req.query.date;
        const treatments = await treatmentCollection.aggregate([
            {
                $lookup: {
                    from: 'bookings',
                    localField: 'name',
                    foreignField: 'treatmentName',
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $eq: ['$appointmentDate', date]
                                }
                            }
                        }
                    ],
                    as: 'booked'
                }
            },
            {
                $project: {
                    name: 1,
                    slots: 1,
                    booked: {
                        $map: {
                            input: '$booked',
                            as: 'book',
                            in: '$$book.slot'
                        }
                    }
                }
            },
            {
                $project: {
                    name: 1,
                    slots: {
                        $setDifference: ['$slots', '$booked']
                    }
                }
            }
        ]).toArray();
        res.send(treatments);
    } catch (error) {
        console.log(error.name.bgRed, error.message.bold);
    }
})

//get appointmentSpecialty data from a collection
app.get('/appointment-specialty', async (req, res) => {
    const specialty = await treatmentCollection.find({}).project({ name: 1 }).toArray();
    res.send(specialty);
})

// save doctors to the the doctorsCollections
app.post('/doctors', async (req, res) => {
    try {
        const doctor = await doctorsCollection.insertOne(req.body);
        res.send({
            status: true,
            message: 'A new doctor added'
        })
    } catch (error) {
        res.send({
            status: false,
            error: error
        })
    }
})

// add doctors to manage-doctors route
app.get('/doctors', async (req, res) => {
    try {
        const doctors = await doctorsCollection.find({}).toArray();
        res.send({
            status: true,
            doctors: doctors
        })
    } catch (error) {
        res.send({
            status: false,
            error: error
        })
    }
})


// insert booking info to db
app.post('/booking', async (req, res) => {
    try {
        const booking = req.body;
        console.log(booking);
        const query = {
            appointmentDate: booking.appointmentDate,
            treatmentName: booking.treatmentName,
            email: booking.email
        }
        const alreadyBooked = await bookingCollection.find(query).toArray();
        if (alreadyBooked.length) {
            return res.send({
                status: false,
                message: `You already have an booking on ${booking.appointmentDate} for ${booking.treatmentName}. You can't book ${booking.treatmentName} again today!`
            })
        }
        const result = await bookingCollection.insertOne(req.body)
        console.log(result);
        if (result.insertedId) {
            res.send({
                status: true,
                message: `Your Booking for ${req.body.treatmentName}  successfully confirmed! Please check your email for more details.`
            })
        } else {
            res.send({
                status: false,
                error: "Error Occurred!"
            })
        }
    } catch (error) {
        console.log(error.name.bgRed, error.message.bold);
        res.send({
            status: false,
            error: error.message
        })
    }
})

//get the booking info from db
app.get('/bookings', verifyJWT, async (req, res) => {
    try {
        // console.log(req.headers.authorization);
        const email = req.query.email;
        const decodedEmail = req.decoded.email;
        console.log('inside booking', email, decodedEmail);
        if (email !== decodedEmail) {
            return res.status(403).send({ message: 'Forbidden access' })
        }

        //before JWT
        const bookings = await bookingCollection.find({ email: req.query.email }).toArray();
        res.send({
            status: true,
            bookings: bookings
        })
    } catch (error) {
        console.log(error.name, error.message);
        res.send({
            status: false,
            error: error.message
        })
    }

})

// save users to db
app.post('/user', async (req, res) => {
    try {
        console.log(req.body);
        const user = await userCollection.insertOne(req.body);
        console.log(user);
        res.send({
            status: true,
            message: `The user successfully added`
        })
    } catch (error) {
        console.log(error.name, error.message);
        res.send({
            status: false,
            error: error
        })
    }
})

//get all the users
app.get('/users', async (req, res) => {
    try {
        const users = await userCollection.find({}).toArray();
        res.send({
            status: true,
            users: users
        })
    } catch (error) {
        res.send({
            status: false,
            error: error
        })

    }

})

// find if admin or not
app.get('/user/admin/:email', async (req, res) => {
    const email = req.params.email;
    const query = { email };
    const user = await userCollection.findOne(query);
    res.send({ isAdmin: user?.role === 'admin' });
})

app.put('/user/admin/:id', verifyJWT, async (req, res) => {
    try {
        const decodedEmail = req.decoded.email;
        console.log(decodedEmail);
        const query = { email: decodedEmail };
        const user = await userCollection.findOne(query);
        console.log('user from 261', user);
        if (user?.role !== 'admin') {
            return res.status(403).send({ message: 'Forbidden access' })
        }

        // before JWT
        const id = req.params.id;
        const filter = { _id: ObjectId(id) };
        const options = { upsert: true };
        const updatedDoc = {
            $set: {
                role: 'admin'
            }
        }
        const result = userCollection.updateOne(filter, updatedDoc, options);
        res.send({
            status: true,
            message: 'You have successfully made a new admin'
        });

    } catch (error) {
        res.send({
            status: false,
            message: error
        })
    }
})

app.get('/', (req, res) => {
    res.send("Dentists Portal Server is Running");
})

app.listen(port, () => {
    console.log(`Dental Server is running on port ${port}`.cyan.bold);
})