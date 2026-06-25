# Spec: Timeless Enterprise Cloud Architecture & Scale Blueprint

## 1. Objective
Design a scalable, highly available, and globally distributed cloud architecture for Timeless Editorial. The architecture must support 10M+ active users, achieve sub-100ms global latency, protect digital intellectual property (DRM), maintain strict compliance with global data protection laws (GDPR, Argentine Law 25.326), and optimize cloud operations costs (FinOps). 

This blueprint addresses five core requested pillars from the roles of **Systems Architect** and **Corporate Governor**:
1. **Event-Driven Architecture (EDA)** for decoupled async processing.
2. **Global CDN & Edge Compute** for low-latency delivery and edge security.
3. **NoSQL Database Strategy** for horizontal scalability and high throughput.
4. **Adaptive Text Streaming (ABR-equivalent)** for fluid, gated content delivery.
5. **Real-Time ML Personalization** for dynamic recommendation pipelines.

---

## 2. Core Architectural Components

```mermaid
graph TD
    %% User and CDN
    User[Globally Distributed Reader] -->|HTTPS / WSS| CDN[Global CDN - Cloudflare Edge]
    
    %% Edge Compute
    subgraph Edge Layer [Edge Compute - Cloudflare Workers]
        CDN --> EdgeAuth[Edge JWT Validator & DRM Key Rotator]
        EdgeAuth -->|Cache Hit <10ms| EdgeCache[(Edge Cache: Covers, Metadata)]
    end
    
    %% Gateway
    EdgeAuth.->|Cache Miss| API[API Gateway: Express / GCP Cloud Run]
    
    %% DBs
    subgraph Data Layer [NoSQL Databases]
        API --> DB[(Cloud Firestore / DynamoDB)]
        DB -.->|Replication| ReadReplicas[(Global Read Replicas)]
    end
    
    %% Event Bus
    subgraph Event Layer [Event-Driven Architecture]
        API -->|Publish Events| EventBus[Event Router: AWS EventBridge / GCP Eventarc]
        EventBus -->|Async Event| TelemetryQ[Telemetry Consumer: SQS / PubSub]
        EventBus -->|Async Event| BillingQ[Billing/Stripe Consumer]
        EventBus -->|Async Event| IngestionQ[Ingestion/QA Audit Consumer]
    end
    
    %% ML
    subgraph ML Pipeline [ML Personalization Layer]
        TelemetryQ -->|Store Features| FeatStore[(Vertex AI Feature Store)]
        FeatStore -->|Real-time Inference| MLModel[Vertex AI Recommendations Engine]
        MLModel -->|Vector Search| VecDB[(Firestore Vector Search / Pinecone)]
        API -.->|Query Recommendations| VecDB
    end

    %% Styles
    style CDN fill:#d5e3f0,stroke:#3b5998,stroke-width:2px
    style EdgeLayer fill:#ede8e0,stroke:#8c541d,stroke-width:2px
    style DataLayer fill:#d5f0d5,stroke:#2d5c2d,stroke-width:2px
    style EventLayer fill:#f0d5f0,stroke:#5c2d5c,stroke-width:2px
    style MLPipeline fill:#f0f0d5,stroke:#5c5c2d,stroke-width:2px
```

### 2.1. Event-Driven Architecture (EDA)
To eliminate latency in the critical user path (reading, login), all secondary workflows must be decoupled asynchronously.
- **Serverless Event Bus**: Utilize AWS EventBridge or GCP Eventarc as the central event router.
- **Core Event Schemas**:
  - `UserJoined`: Triggers welcome emails, creates telemetry queues, and sets up profile.
  - `BookDownloaded`: Triggers licensing compliance validation and audits offline DRM limits.
  - `TelemetryLogged`: Pushes raw scroll/time metrics to a message queue for ML analysis.
  - `PaymentSucceeded / BillingFailed`: Toggles subscription state and notifies members.
- **Message Queues & Processing**: Use AWS SQS / GCP Pub/Sub to buffer events. Standardize on Dead-Letter Queues (DLQ) with alarms for failed event processing to guarantee 99.99% message durability.

### 2.2. Global CDN & Edge Compute
Minimize latency by moving security gates, licensing, and assets closer to readers.
- **Global CDN**: Cloudflare Enterprise with geo-routing and Smart Routing (Argo) to minimize packet transit time.
- **Edge Compute (Cloudflare Workers)**:
  - **Edge JWT Auth Check**: Intercept incoming API requests at the edge. Validate Firebase Auth JWT tokens directly on the edge node. Non-members are rejected immediately without hitting the origin server, preventing DDoS attacks and origin overload.
  - **DRM Key Rotation**: Decrypt temporary licenses and serve cryptographic keys dynamically at the edge based on token expiration.
  - **Cache Optimization**: Implement Stale-While-Revalidate caching policies for book listings, cover SVGs, and metadata.

### 2.3. NoSQL Database Strategy (Firestore / DynamoDB)
Scale horizontally to accommodate unlimited read/write volume while maintaining predictable costs.
- **Database Model**: Single-table design architecture.
  - **Telemetry Partition Key (PK)**: `USER#<UserId>` | **Sort Key (SK)**: `READ#<Timestamp>`
  - **Book Partition Key (PK)**: `BOOK#<BookId>` | **Sort Key (SK)**: `METADATA`
- **Replication**: Enable global multi-region active-passive replication. Locally cached reads on the edge will serve 95% of queries.
- **Budget Protection**: Configure read/write capacity limits. Enforce client-side rate limiters via Cloudflare to protect Firestore free tier boundaries and throttle malicious query loops.

### 2.4. Adaptive Bitrate Streaming (ABR) for Text
While video uses HLS/DASH to adapt video quality (resolution), Timeless adapts text streaming to network conditions and access privileges.
- **Text Chunks (HLS-like)**: Manuscritos are partitioned into small, encripted chunks (paragraphs or pages).
- **Adaptive Loading**:
  - **Fast Connection**: Prefetch upcoming 3 chapters in the background.
  - **Slow Connection (Low-bandwidth)**: Stream only the paragraph currently in the viewport, postponing metadata loading.
- **DRM Integration**: Each chunk is encrypted with a unique key. The client must continuously request the next key from the Edge Auth layer as they scroll. If subscription validation fails mid-reading, decryption keys are withheld, and the screen is locked immediately.

### 2.5. Real-Time ML Personalization
Provide Netflix-like hyper-personalized rows matching reader affinity dynamically.
- **Embeddings Pipeline**: Generate 768-dimensional vector embeddings for all books using Gemini Text Embeddings API.
- **Vector Database**: Store embeddings in Vertex AI Vector Search or Firestore Vector Search (using HNSW index).
- **Real-Time Recommendation Engine**:
  - As a user reads, their telemetric scroll speed, genres read, and time spent are sent via EDA to a Vertex AI Feature Store.
  - An ML inference model computes the user's live preference vector.
  - Perform a vector search on the nearest neighbor books to return recommendations in less than 50ms, dynamically populating the "Recomendados para ti" carousel.

---

## 3. Corporate Governance & Cybersecurity

### 3.1. Data Privacy Compliance
- **Legislation**: Adhere to GDPR (EU), CCPA (US), and Argentine Personal Data Protection Law (Ley 25.326).
- **Implementation**:
  - **Data Minimization**: Telemetry data must be anonymized before being ingested by the ML model. IP addresses and precise locations are discarded at the CDN edge.
  - **Right to Be Forgotten**: Provide a self-service page to erase user profiles and their corresponding Firestore telemetry records.
  - **Consent Management**: Ensure the Cookie Consent Banner persists local choices and only loads non-essential tracking scripts after explicit consent.

### 3.2. Cost Governance (FinOps)
- **Firestore Reads Control**: Edge caches must handle 100% of guest traffic. Any public guest landing page query must return static, edge-cached content (e.g., static cover SVGs and marketing pages).
- **ML Inference Budget**: Batch calculations of user preference vectors every 30 minutes, rather than on every scroll, to reduce Vertex AI costs while preserving "near real-time" accuracy.

### 3.3. DRM & IP Protection
- **Anti-Scraping Policies**: Restrict edge requests using Cloudflare Bot Management. Block headless browsers, scrapers, and raw HTTP clients from reading book chunks.
- **Encryption Governance**: Rotate AES-256 master keys weekly. Temporary offline reading keys must expire automatically in 30 days and require online re-validation.

---

## 4. Definition of Done (DoD)
- [ ] **DoD-1**: Architectural blueprint is fully defined with no placeholders.
- [ ] **DoD-2**: All 5 requested pillars (EDA, CDN, NoSQL, ABR, ML) are fully mapped out.
- [ ] **DoD-3**: Database partition key strategies and data models are defined.
- [ ] **DoD-4**: Governance compliance criteria (Data privacy, DRM, FinOps) are established.
- [ ] **DoD-5**: The specification file compiles correctly in markdown syntax.
