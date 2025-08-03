# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Identity Tracking and Access Platform (ITAP) monorepo - a comprehensive platform leveraging advanced computer vision technologies to detect and identify individuals in video streams and images. The platform is designed to be adaptable, scalable, and privacy-conscious, supporting various use cases across different industries.

**Current Status**: This project is transitioning from design to implementation phase. We are building a working MVP to validate the market hypothesis using open-source face recognition solutions before developing our own models.

## Architecture Overview

Based on the functional specification, ITAP will consist of the following core modules:

### Core Functional Modules
- **Identity Database Management**: Centralized storage and management of Identity records
- **Profile Management**: Management of known individuals with personal data linked to Identities
- **Segment Management**: Creation and management of logical groups of Identities
- **Face-Based Authorization Tools**: Integration APIs and SDKs for face recognition-based authentication
- **Identity Search**: Fast and accurate search capabilities using facial data and attributes
- **Facility and Area Management**: Hierarchical mapping of physical locations
- **Device Management**: Registration and configuration of video sources and hardware
- **Real-Time Tracking**: Visualization and monitoring of Identity movements
- **Analytics and Reporting**: Tools for analyzing flows, behaviors, and trends
- **Notification System**: Configurable alerts for security and operational events

### Key Domain Entities
- **Identity**: Any entity tracked by the platform (known/unknown individuals)
- **Profile**: Supplementary record with personal data for known individuals
- **Segment**: Logical grouping of Identities based on conditions/attributes
- **Facility**: Physical site (warehouse, factory, retail store, etc.)
- **Area**: Hierarchical subdivision of Facilities into zones
- **Device**: Hardware components (cameras, sensors, access control terminals)

## Technology Stack

### Frontend
- **Framework**: React + TypeScript + TailwindCSS v4 + shadcn/ui
- **Routing**: React Router (client-side routing, no SSR needed)
- **State Management**: React Query for server state, Zustand for client state
- **Real-time**: WebSocket connection for live tracking updates

### Backend
- **Runtime**: Node.js + Express + TypeScript
- **Database**: PostgreSQL (via Docker) + TypeORM for development simplicity
- **Cache/Sessions**: Redis
- **Authentication**: JWT-based authentication
- **Real-time**: Socket.io for WebSocket connections

### Face Recognition
- **Primary Service**: CompreFace (self-hosted open-source solution)
- **Fallback**: FaceAPI.js for client-side processing
- **Image Processing**: OpenCV for preprocessing
- **Alternative**: InsightFace for high-quality embeddings

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **Database**: PostgreSQL container for local and production
- **File Storage**: Minio (S3-compatible) for images and reports
- **Reverse Proxy**: nginx for load balancing and static files

## Development Commands

### Local Development Setup
```bash
# Install dependencies
npm install

# Setup backend (install deps + download face recognition models)
cd apps/backend && pnpm setup

# Start development environment
docker-compose up -d postgres redis minio  # Start infrastructure
npm run dev:backend    # Start backend server
npm run dev:frontend   # Start frontend development server

# Database operations
npm run db:migrate     # Run database migrations
npm run db:seed        # Seed initial data

# Face recognition models
cd apps/backend && pnpm download-models  # Download face-api.js models
```

### Production Commands
```bash
# Build and deploy
docker-compose up -d   # Full production stack
npm run build          # Build frontend for production
npm run start          # Start production server
```

### Testing
```bash
npm run test           # Run all tests
npm run test:e2e       # Run end-to-end tests
npm run lint           # Run linting
npm run typecheck      # Run type checking
```

## Documentation Structure

The project documentation is organized as follows:

- `docs/Vision_and_Scope.md`: High-level project vision, scope, application domains, and architectural principles
- `docs/Functional_Specification.md`: Detailed functional requirements with user stories, acceptance criteria, domain entities, and interface specifications

## Key Architectural Principles

- **Modularity**: Independent modules for flexible deployment and expansion
- **Scalability**: Support for both vertical and horizontal scaling
- **Privacy by Design**: Data minimization, anonymization, and encryption
- **Security First**: Integrated security considerations throughout development
- **Interoperability**: Open APIs and standard protocols for third-party integration

## Implementation Roadmap

### Phase 1: Core Foundation (MVP)
1. **Identity Database Management**: Basic CRUD operations for Identity records
2. **Device Management**: Single camera integration with CompreFace
3. **Facility/Area Management**: Simple hierarchical structure
4. **Basic Face Recognition**: Identity enrollment and recognition
5. **Simple Dashboard**: Basic management interface

### Phase 2: Real-time Features
1. **Real-time Tracking**: Live Identity movement monitoring
2. **Multiple Camera Support**: Scale to multiple video sources
3. **Analytics Dashboard**: Basic reporting and visualization
4. **Notification System**: Configurable alerts and notifications

### Phase 3: Advanced Features
1. **Advanced Analytics**: Heatmaps, flow analysis, behavioral patterns
2. **Profile Management**: Enhanced personal data management
3. **Segment Management**: Dynamic grouping and targeting
4. **API/SDK**: Third-party integration capabilities
5. **Export/Import**: Data portability and backup features

## Development Guidelines

1. **Follow the Domain Model**: Refer to the functional specification for detailed entity definitions and relationships
2. **Implement Privacy Controls**: Ensure data minimization, anonymization options, and GDPR/CCPA compliance
3. **Focus on Modularity**: Design independent, loosely-coupled modules that can be deployed flexibly
4. **Plan for Scale**: Consider horizontal scaling and distributed architecture from the start
5. **Security Integration**: Implement security controls at every layer (authentication, authorization, audit trails)
6. **English Only**: All code, comments, and documentation must be in English
7. **Docker First**: Ensure everything can be deployed via Docker Compose
8. **Local Development**: Support local development with hot reload and debugging

## Project Structure

```
3v_mono/
├── apps/
│   ├── frontend/          # React dashboard application
│   ├── backend/           # Express API server
│   └── face-service/      # Face recognition microservice
├── packages/
│   ├── shared/           # Shared types and utilities
│   └── database/         # Database schemas and migrations
├── docker/               # Docker configurations
├── docs/                 # Project documentation
└── scripts/              # Build and deployment scripts
```

## Face Recognition Strategy

Since this is an MVP to validate market hypothesis, we're using proven open-source solutions:

1. **CompreFace**: Primary self-hosted face recognition service
   - Docker-based deployment
   - REST API for face detection and recognition
   - Good accuracy for MVP validation

2. **Fallback Options**:
   - FaceAPI.js for client-side processing
   - MediaPipe for real-time face detection
   - InsightFace for high-quality embeddings

3. **Future Migration Path**: 
   - Once market hypothesis is validated, integrate custom models
   - Maintain same API interface for seamless transition
   - Consider cloud solutions (AWS Rekognition, Azure Face API) for scaling

## Key Implementation Notes

The functional specification includes detailed user stories with:
- Acceptance criteria in Gherkin format
- Complete domain entity schemas
- Interface specifications
- Sequence diagrams
- Performance metrics and SLIs/SLOs
- Real-world use cases

## Compliance and Security Considerations

- Must comply with data protection regulations (GDPR, CCPA)
- Implement privacy-by-design principles
- Support data anonymization and pseudonymization
- Maintain comprehensive audit trails
- Encrypt sensitive data in transit and at rest
- Implement strict access controls