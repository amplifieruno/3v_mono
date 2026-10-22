import type { TranslationBundle } from '@burojs/i18n-core';

/**
 * App chrome in the `common` namespace (English, primary). Labels declared in
 * code (`texts`) are not repeated here; this bundle holds what code does not
 * declare: the console chrome and the glossary.
 */
export default {
  /** The shell, the auth pages and the sidebar switchers (`src/app`, `src/auth`). */
  console: {
    brand: 'ITAP',
    subtitle: 'Identity tracking and access',
    organization: 'Organization',
    facility: 'Facility',
    allFacilities: 'All facilities',
    signOut: 'Sign out',
    retry: 'Retry',
    identityFailed: {
      title: 'Could not load your organizations',
      body: 'The server could not be reached. Check the connection and try again.',
    },
    /** The storage file field (`src/fields/storage-file-impl.ts`). */
    storageFile: {
      upload: 'Upload',
      replace: 'Replace',
      remove: 'Remove',
      uploading: 'Uploading…',
      open: 'Open file',
      preview: 'Preview',
      accepts: 'Accepts {{accept}}',
      tooLarge: 'The file is larger than {{max}}.',
      wrongType: 'This file type is not accepted here.',
      refused: 'Storage refused the file ({{status}}). {{message}}',
      failed: 'The upload failed. Check the connection and try again.',
      openFailed: 'The file could not be opened.',
    },
    /** The time zone field (`src/fields/timezone-impl.ts`). */
    timezone: {
      placeholder: 'Select a time zone…',
      search: 'Search time zones',
      empty: 'No time zone matches.',
      unknown: 'Unknown time zone',
      clear: 'Clear time zone',
    },
    /** The time window field (`src/fields/time-windows-impl.ts`). */
    timeWindows: {
      add: 'Add window',
      remove: 'Remove window {{index}}',
      window: 'Window {{index}}',
      days: 'Days of window {{index}}',
      from: 'From',
      to: 'To',
      timeHint: 'HH:MM',
      overnight: 'overnight',
      endsNextDay: 'Ends the next day',
      daily: 'Daily',
      invalid: 'Contains an invalid window',
    },
    /** The list-of-texts field (`src/fields/string-list-impl.ts`); `item` is lowercase (`option`). */
    stringList: {
      add: 'Add {{item}}',
      remove: 'Remove {{item}} {{index}}',
      /** A row's text box; `item` is capitalized here (`Option 2`). */
      row: '{{item}} {{index}}',
    },
    /** The custom attribute values field (`src/fields/custom-fields-impl.ts`). */
    customFields: {
      loading: 'Loading custom attributes…',
      failed: 'Custom attributes could not be loaded; the server checks the values on save.',
      none: 'No custom attributes are defined for this kind of record.',
      yes: 'Yes',
      no: 'No',
      unset: 'Not set',
      kept: 'Kept values',
      inactiveNote: 'Inactive attribute; kept as stored.',
      removedNote: 'This attribute no longer exists; remove the value to save.',
      remove: 'Remove the value of {{key}}',
    },
    /** The floor plan under the plan-space inputs (`src/fields/plan-canvas.tsx`). */
    planCanvas: {
      'no-facility': 'Choose the facility first; the floor plan comes from it.',
      pending: 'Loading the floor plan…',
      error: 'The floor plan could not be loaded; the value is kept as it is.',
      none: 'No floor plan covers this place yet. Add a floor plan to its floor (or an enclosing area) under Floor plans, then draw here.',
      imageFailed: 'The floor plan image could not be loaded; the outline is drawn on a blank sheet.',
    },
    /** The area shape field (`src/fields/area-shape-impl.ts`). */
    areaShape: {
      tools: 'Shape tools',
      polygon: 'Polygon',
      circleMode: 'Circle',
      undo: 'Remove last point',
      clear: 'Clear shape',
      canvas: 'Area shape on the floor plan {{plan}}',
      hintPolygon: 'Click on the plan to add the outline points, in order.',
      hintCircle: 'Click on the plan to place the centre, then click again to set the radius.',
      points: 'Polygon, {{count}} points',
      circle: 'Circle, radius {{radius}} px',
      point: 'Point {{index}} (drag to move)',
      center: 'Centre (drag to move)',
    },
    /** The plan position field (`src/fields/plan-position-impl.ts`). */
    planPosition: {
      canvas: 'Position on the floor plan {{plan}}',
      hint: 'Click on the plan to place the point.',
      at: 'x {{x}}, y {{y}} px',
      clear: 'Clear position',
    },
    /** The facility template structure display (`src/fields/template-structure-impl.ts`). */
    templateStructure: {
      tree: 'Areas the template creates',
      capacity: 'capacity {{capacity}}',
      count: 'Areas created when applied: {{count}}',
    },
    /** The image size field (`src/fields/image-size-impl.ts`). */
    imageSize: {
      use: 'Use the image’s {{size}} px',
    },
    organizations: {
      title: 'Choose an organization',
      description: 'You are a member of several organizations. You can switch later from the sidebar.',
      noneTitle: 'No active organization',
      noneBody:
        'Your account has no active organization membership, so there is nothing to open yet. ' +
        'Ask an administrator of your organization to invite you or to reactivate your membership.',
    },
  },
  /**
   * Refusals of the reusable fields' validators (`src/fields/field-issue.ts`): key
   * `validation.itap.<code>`, the code's params interpolated. Each text equals the
   * English default the validator carries (`tests/support/field-issues.ts`).
   */
  validation: {
    itap: {
      timeWindows: {
        notList: 'Time windows must be a list of windows.',
        notWindow: 'Window {{index}}: is not a window.',
        unexpectedKeys: 'Window {{index}}: has unexpected keys ({{keys}}).',
        daysNotList: 'Window {{index}}: days must be a list of weekdays 1–7.',
        noDays: 'Window {{index}}: pick at least one day.',
        badDays: 'Window {{index}}: days must be weekdays 1–7 (Monday = 1).',
        badTimes:
          'Window {{index}}: enter times as HH:MM, from 00:00 to 23:59 (24:00 only as the end).',
        sameEnds: 'Window {{index}}: start and end are the same; use 00:00–24:00 for a whole day.',
      },
      stringList: {
        notList: '{{item}}s must be a list.',
        none: 'Add at least one {{itemLower}}.',
        notText: '{{item}} {{index}} is not text.',
        blank: '{{item}} {{index}} is empty.',
        repeated: '{{item}} {{index}} repeats {{itemLower}} {{first}}.',
      },
      timezone: {
        unknown: 'Not a known time zone. Pick one from the list (for example Europe/Moscow).',
      },
      customFields: {
        notObject: 'Custom fields must be an object of attribute values.',
        undefinedKey: 'No custom attribute “{{key}}” exists any more; remove its value to save.',
        required: '{{label}} is required.',
        notText: '{{label}}: enter text.',
        notNumber: '{{label}}: enter a number.',
        notBoolean: '{{label}}: choose yes or no.',
        notDate: '{{label}}: enter a date as YYYY-MM-DD.',
        notOption: '{{label}}: pick one of the options.',
      },
      areaShape: {
        notShape: 'A shape must be a polygon or a circle.',
        unexpectedKeys: 'The shape has unexpected keys ({{keys}}).',
        badCenter: 'A circle needs a centre point [x, y].',
        badRadius: 'A circle needs a radius greater than 0.',
        badPoint: 'Point {{index}} is not a pair of numbers.',
        tooFewPoints: 'A shape needs at least 3 different points; add more points or clear the shape.',
        outside: 'Point {{index}} ({{x}}, {{y}}) lies outside the floor plan ({{width}} × {{height}} px).',
        circleOutside:
          'The circle (centre {{x}}, {{y}}, radius {{radius}}) reaches outside the floor plan ({{width}} × {{height}} px).',
      },
      planPosition: {
        notPoint: 'A position must be a point [x, y].',
        outside: 'The position ({{x}}, {{y}}) lies outside the floor plan ({{width}} × {{height}} px).',
      },
      templateStructure: {
        notList:
          'The structure must be a list of areas, such as [{"name": "Lobby", "area_type": "zone"}].',
        empty: 'Add at least one area to the structure.',
        notNode: 'Area {{node}} is not an object.',
        unexpectedKeys:
          'Area {{node}} has unexpected keys ({{keys}}); use name, area_type, access_level, capacity and children.',
        noName: 'Area {{node}} needs a name.',
        longName: 'Area {{node}}: the name is longer than {{max}} characters.',
        badType: 'Area {{node}}: area_type must be one of {{types}}.',
        badAccessLevel: 'Area {{node}}: access_level must be one of {{levels}}.',
        badCapacity: 'Area {{node}}: capacity must be a whole number of at least 0.',
        childrenNotList: 'Area {{node}}: children must be a list of areas.',
        tooDeep: 'The structure is deeper than {{max}} levels.',
        tooMany: 'The structure has more than {{max}} areas.',
      },
      number: {
        range: 'Enter a number from {{min}} to {{max}}.',
        rangeWhole: 'Enter a whole number from {{min}} to {{max}}.',
        atLeast: 'Enter a number of at least {{min}}.',
        atLeastWhole: 'Enter a whole number of at least {{min}}.',
      },
    },
  },
  /**
   * Glossary terms, listed in `DocsConfig.concepts` (`../../docs.ts`) and
   * reachable from any doc through `doc.see: 'concept/<term>'`.
   */
  concepts: {
    'organization-token': {
      label: 'Organization token',
      doc: {
        summary:
          'The short-lived access token (15 minutes) the console works with inside one ' +
          'organization. It is issued by the `switch_organization` action after sign-in, ' +
          'carries the organization id and the `org_admin` role, and is renewed automatically ' +
          'before it expires. Switching organization issues a new token and clears cached data.',
      },
    },
  },
} satisfies TranslationBundle;
