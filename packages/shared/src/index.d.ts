export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
}
export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
export interface Identity {
    id: string;
    embeddings?: number[][];
    attributes?: Record<string, any>;
    photos: string[];
    confidence: number;
    status: 'verified' | 'unverified' | 'archived';
    createdAt: Date;
    updatedAt: Date;
    firstSeen?: Date;
    lastSeen?: Date;
    detectionCount: number;
    profile?: Profile;
}
export interface Profile {
    id: string;
    identityId: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    employeeId?: string;
    department?: string;
    role?: string;
    accessLevel: 'basic' | 'standard' | 'elevated' | 'admin';
    startDate?: Date;
    endDate?: Date;
    status: 'active' | 'inactive' | 'suspended' | 'terminated';
    customFields?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
export interface Facility {
    id: string;
    name: string;
    description?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    timezone: string;
    createdBy: string;
    status: 'active' | 'inactive' | 'maintenance';
    createdAt: Date;
    updatedAt: Date;
    areas?: Area[];
}
export interface Area {
    id: string;
    facilityId: string;
    parentId?: string;
    name: string;
    description?: string;
    areaType: 'building' | 'floor' | 'room' | 'zone' | 'sector';
    coordinates?: any;
    accessLevel: 'public' | 'restricted' | 'secure' | 'classified';
    status: 'active' | 'inactive' | 'maintenance';
    createdAt: Date;
    updatedAt: Date;
    parent?: Area;
    children?: Area[];
    devices?: Device[];
}
export interface Device {
    id: string;
    name: string;
    deviceType: 'static_video_camera' | 'ptz_camera' | 'sensor';
    areaId: string;
    streamUrl?: string;
    credentials?: Record<string, any>;
    resolution?: string;
    fps?: number;
    status: 'active' | 'inactive' | 'error' | 'maintenance';
    healthStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
    lastSeen?: Date;
    configuration?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
    area?: Area;
}
export interface TrackingSession {
    id: string;
    identityId: string;
    facilityId: string;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    path?: any[];
    status: 'active' | 'completed' | 'lost' | 'error';
    locations?: IdentityLocation[];
}
export interface IdentityLocation {
    id: string;
    identityId: string;
    areaId: string;
    deviceId: string;
    latitude?: number;
    longitude?: number;
    confidence: number;
    movementType: 'entry' | 'exit' | 'movement' | 'stationary';
    sessionId?: string;
    timestamp: Date;
}
export interface Segment {
    id: string;
    name: string;
    description?: string;
    conditions: Record<string, any>;
    isDynamic: boolean;
    memberCount: number;
    createdBy: string;
    lastEvaluated?: Date;
    status: 'active' | 'inactive' | 'archived';
    createdAt: Date;
    updatedAt: Date;
}
export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'admin' | 'operator' | 'viewer';
    isActive: boolean;
    lastLoginAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export interface AnalyticsStats {
    totalIdentities: number;
    activeDevices: number;
    facilities: number;
    liveTracking: number;
    todayDetections: number;
    weeklyGrowth: number;
}
export interface ActivityEvent {
    id: string;
    type: string;
    message: string;
    details: string;
    timestamp: Date;
}
export interface WebSocketEvent {
    type: string;
    data: any;
    timestamp: Date;
}
export interface IdentityDetectionEvent extends WebSocketEvent {
    type: 'identity_detected';
    data: {
        identityId: string;
        deviceId: string;
        areaId: string;
        confidence: number;
        profile?: Profile;
    };
}
export interface DeviceStatusEvent extends WebSocketEvent {
    type: 'device_status_changed';
    data: {
        deviceId: string;
        status: Device['status'];
        healthStatus: Device['healthStatus'];
    };
}
export interface LoginRequest {
    email: string;
    password: string;
}
export interface AuthResponse {
    user: User;
    token: string;
}
export interface ApiError {
    statusCode: number;
    message: string;
    details?: any;
}
//# sourceMappingURL=index.d.ts.map