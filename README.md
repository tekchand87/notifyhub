# NotifyHub

A multi-tenant, real-time notification and webhook delivery platform built using event-driven architecture.

NotifyHub allows applications and organizations to publish events through an API. These events are processed asynchronously and delivered through different channels such as webhooks and email.

The system is designed to handle scalable notification delivery, retries, failed messages, and tenant-based data isolation.

---

## 🚀 Features

- User Authentication
- JWT-based Authorization
- Multi-Tenant Architecture
- API Key Management
- Event Ingestion API
- Apache Kafka Event Streaming
- Asynchronous Background Workers
- Webhook Delivery
- Email Notifications
- Retry Mechanism
- Exponential Backoff
- Dead Letter Queue (DLQ)
- Delivery Status Tracking
- Tenant Dashboard
- Docker Support

---

## 🏗️ High-Level Architecture

```text
Client Application
        │
        ▼
   API Gateway
        │
        ▼
Authentication / API Key Validation
        │
        ▼
   Event Ingestion
        │
        ▼
   Apache Kafka
        │
        ▼
 Background Workers
        │
        ├──────────────► Webhook Delivery
        │
        ├──────────────► Email Delivery
        │
        ▼
 Retry Mechanism
        │
        ▼
Dead Letter Queue (DLQ)
```

---

## 🛠️ Technology Stack

### Backend

- Node.js
- Express.js

### Database

- MongoDB
- Mongoose

### Authentication

- JSON Web Token (JWT)
- bcryptjs

### Validation

- Zod

### Event Streaming

- Apache Kafka

### Containerization

- Docker
- Docker Compose

### Other Technologies

- REST APIs
- Webhooks
- Background Workers
- Retry Mechanisms
- Dead Letter Queues

---

## 📁 Project Structure

```text
notifyhub/
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── database/
│   │   ├── middleware/
│   │   ├── utils/
│   │   │
│   │   └── modules/
│   │       ├── auth/
│   │       ├── tenant/
│   │       ├── api-key/
│   │       ├── event/
│   │       ├── webhook/
│   │       ├── delivery/
│   │       └── dashboard/
│   │
│   ├── app.js
│   └── server.js
│
├── frontend/
│
├── worker/
│
├── docker/
│
├── .gitignore
│
└── README.md
```

---

## 🧩 Project Modules

The project is developed module by module.

### 1. Authentication Module

Responsible for:

- User registration
- User login
- Password hashing
- JWT token generation
- Protected routes
- User authorization
- Change password

### 2. Tenant Module

Responsible for:

- Creating organizations/tenants
- Managing tenant information
- Tenant-based data isolation

### 3. API Key Module

Responsible for:

- Creating API keys
- Validating API keys
- Revoking API keys
- Associating API keys with tenants

### 4. Event Module

Responsible for:

- Receiving events
- Validating events
- Publishing events to Kafka

### 5. Kafka Module

Responsible for:

- Event streaming
- Asynchronous communication
- Decoupling producers and consumers

### 6. Worker Module

Responsible for:

- Consuming Kafka events
- Processing notifications
- Sending events to delivery services

### 7. Delivery Module

Responsible for:

- Webhook delivery
- Email delivery
- Tracking delivery status

### 8. Retry Module

Responsible for:

- Retrying failed deliveries
- Exponential backoff
- Managing retry attempts

### 9. Dead Letter Queue

Responsible for:

- Storing permanently failed events
- Debugging failed deliveries
- Reprocessing messages when required

---

## 🔐 Authentication Flow

```text
User
  │
  ▼
Register / Login
  │
  ▼
Validate Request
  │
  ▼
Authentication Service
  │
  ├── Hash Password
  │
  ├── Verify Password
  │
  ▼
Generate JWT Token
  │
  ▼
Return Access Token
```

For protected routes:

```text
Client Request
      │
      ▼
Authorization: Bearer TOKEN
      │
      ▼
JWT Authentication Middleware
      │
      ▼
Verify Token
      │
      ▼
Attach User to Request
      │
      ▼
Protected Controller
```

---

## ⚡ Future Event Flow

```text
Client Application
       │
       │ POST /api/v1/events
       ▼
   NotifyHub API
       │
       │ Validate API Key
       ▼
   Event Service
       │
       ▼
   Apache Kafka
       │
       ▼
   Background Worker
       │
       ├──► Webhook
       │
       └──► Email
                │
                ▼
         Delivery Status
                │
                ▼
        Retry if Failed
                │
                ▼
      Dead Letter Queue
```

---

## 🚦 Development Status

| Module             | Status         |
| ------------------ | -------------- |
| Project Setup      | 🔄 In Progress |
| Authentication     | 🔄 In Progress |
| Tenant Management  | ⏳ Planned     |
| API Key Management | ⏳ Planned     |
| Event Ingestion    | ⏳ Planned     |
| Kafka Integration  | ⏳ Planned     |
| Background Workers | ⏳ Planned     |
| Webhook Delivery   | ⏳ Planned     |
| Email Delivery     | ⏳ Planned     |
| Retry Mechanism    | ⏳ Planned     |
| Dead Letter Queue  | ⏳ Planned     |
| Dashboard          | ⏳ Planned     |
| Docker Deployment  | ⏳ Planned     |

---

## 👥 Team

This project is being developed as a team project.

Contributors:

- Tekchand Yadav
- Contributor 2

---

## 📌 Development Approach

The project follows a modular architecture.

Each module contains its own:

```text
module/
├── model.js
├── validator.js
├── service.js
├── controller.js
├── routes.js
└── README.md
```

The development flow is:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Model / Database
```

---

## 📈 Future Improvements

- Refresh Tokens
- Email Verification
- Password Reset
- Role-Based Access Control
- Rate Limiting
- Redis Caching
- Notification Templates
- SMS Notifications
- Real-Time Dashboard
- Analytics
- Monitoring
- Prometheus
- Grafana
- Kubernetes Deployment

---

## 📄 License

This project is currently developed for educational and learning purposes.

---

## 👨‍💻 Author

**Tekchand Yadav**

GitHub: https://github.com/tekchand87
