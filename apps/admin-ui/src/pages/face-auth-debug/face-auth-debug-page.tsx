/**
 * Face Authentication Debug Page
 *
 * Tabbed interface for testing face detection and enrollment features
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrackingDebugTab } from './tabs/tracking-debug';
import { EnrollmentDebugTab } from './tabs/enrollment-debug';

/**
 * Main Debug Page Component
 */
export function FaceAuthDebugPage() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Face Detection Debug</h1>
          <p className="text-muted-foreground mt-1">
            Test face detection tracking and enrollment features
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="tracking" className="space-y-6">
          <TabsList>
            <TabsTrigger value="tracking">Face Tracking</TabsTrigger>
            <TabsTrigger value="enrollment">Face ID Enrollment</TabsTrigger>
          </TabsList>

          <TabsContent value="tracking">
            <TrackingDebugTab />
          </TabsContent>

          <TabsContent value="enrollment">
            <EnrollmentDebugTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default FaceAuthDebugPage;
