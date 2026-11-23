import { Layers, Palette } from 'lucide-react';
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { BlueprintPreview } from '@/components/BlueprintPreview';
import { CutListCard } from '@/components/CutListCard';
import { Header } from '@/components/Header';
import { SidebarControls } from '@/components/SidebarControls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { calculateCaseGeometry } from '@/core/geometry';
import { generateInnerTemplatesPdf, generateOuterWrapPdf } from '@/core/pdfExport';
import {
  clearProjectStorage,
  loadProjectFromStorage,
  saveProjectToStorage,
  triggerBytesDownload,
  triggerTextDownload,
} from '@/core/storage';
import { generateInnerTemplatesSvg, generateOuterWrapSvg } from '@/core/svgExport';
import { BookParametersModel, type BookParameters } from '@/types/bookParams';
import { BookbinderProjectModel, type BookbinderProject } from '@/types/project';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';

type WorkspaceTab = 'templates' | 'studio';

const CoverStyler = lazy(async () => {
  const mod = await import('@/studio/CoverStyler');
  return { default: mod.CoverStyler };
});

export function App() {
  const [project, setProject] = useState<BookbinderProject>(() => loadProjectFromStorage());
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('templates');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [exportingTarget, setExportingTarget] = useState<'outer-pdf' | 'inner-pdf' | null>(null);

  const geometry = useMemo(
    () => calculateCaseGeometry(project.parameters),
    [project.parameters],
  );

  useEffect(() => {
    const result = saveProjectToStorage(project);
    if (result.omittedImageForQuota) {
      setStatusMessage('Settings saved (cover image too large for localStorage)');
    }
  }, [project]);

  const handleParamsChange = (parameters: BookParameters) => {
    setProject((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      parameters,
    }));
  };

  const handleStudioChange = (studio: CoverStudioState) => {
    setProject((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      studio,
    }));
  };

  const handleDownloadOuterSvg = () => {
    const svg = generateOuterWrapSvg(geometry, project.parameters.splitMode);
    const filename =
      project.parameters.splitMode === 'three-piece'
        ? 'outer_case_wrap_3piece.svg'
        : 'outer_case_wrap.svg';
    triggerTextDownload(svg, filename, 'image/svg+xml;charset=utf-8');
    setStatusMessage(`Exported ${filename}`);
  };

  const handleDownloadOuterPdf = async () => {
    setExportingTarget('outer-pdf');
    try {
      const bytes = await generateOuterWrapPdf(geometry, project.parameters.splitMode);
      const filename =
        project.parameters.splitMode === 'three-piece'
          ? 'outer_case_wrap_3piece.pdf'
          : 'outer_case_wrap.pdf';
      triggerBytesDownload(bytes, filename, 'application/pdf');
      setStatusMessage(`Exported ${filename} (1:1 mm)`);
    } catch {
      setStatusMessage('Failed to generate outer wrap PDF.');
    } finally {
      setExportingTarget(null);
    }
  };

  const handleDownloadInnerSvg = () => {
    const svg = generateInnerTemplatesSvg(geometry);
    triggerTextDownload(svg, 'inner_pockets_and_liner.svg', 'image/svg+xml;charset=utf-8');
    setStatusMessage('Exported inner_pockets_and_liner.svg (1:1 mm)');
  };

  const handleDownloadInnerPdf = async () => {
    setExportingTarget('inner-pdf');
    try {
      const { bytes, plan } = await generateInnerTemplatesPdf(
        geometry,
        project.parameters.pdfPageSize,
      );
      triggerBytesDownload(bytes, 'inner_pockets_and_liner.pdf', 'application/pdf');
      setStatusMessage(
        `Exported inner_pockets_and_liner.pdf (${plan.pageCount} ${plan.pageCount === 1 ? 'page' : 'pages'})`,
      );
    } catch {
      setStatusMessage('Failed to generate inner templates PDF.');
    } finally {
      setExportingTarget(null);
    }
  };

  const handleExportJson = () => {
    const json = BookbinderProjectModel.toJson(project);
    const fileName = BookbinderProjectModel.suggestFileName(
      project.name,
      project.studio.spineText.title,
    );
    triggerTextDownload(json, fileName, 'application/json;charset=utf-8');
    setStatusMessage(`Saved ${fileName}`);
  };

  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = BookbinderProjectModel.fromJson(text);
      if (!parsed.ok) {
        setStatusMessage(`Import error: ${parsed.error}`);
        return;
      }
      setProject(parsed.project);
      setStatusMessage(`Loaded ${file.name}`);
    } catch {
      setStatusMessage('Could not read selected project file.');
    }
  };

  const handleResetDefaults = () => {
    clearProjectStorage();
    setProject(
      BookbinderProjectModel.create(
        BookParametersModel.createDefault(),
        CoverStudioModel.createDefault(),
      ),
    );
    setStatusMessage('Reset to default dimensions');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header
        statusMessage={statusMessage}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
      />

      <main
        id="main-workspace"
        tabIndex={-1}
        className={`mx-auto grid max-w-[1680px] grid-cols-1 gap-4 px-3 py-4 sm:px-5 ${
          sidebarOpen ? 'lg:grid-cols-[310px_minmax(0,1fr)]' : 'lg:grid-cols-1'
        }`}
      >
        {sidebarOpen && (
          <SidebarControls
            params={project.parameters}
            onChange={handleParamsChange}
            onExportJson={handleExportJson}
            onImportJson={handleImportJson}
            onResetDefaults={handleResetDefaults}
          />
        )}

        <div className="flex min-w-0 flex-col gap-4">
          <CutListCard geometry={geometry} unit={project.parameters.unit} />

          {/* Folder-style Paper Index Tabs anchored directly onto the top edge of the workbench */}
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as WorkspaceTab)}
            className="flex flex-col"
          >
            <div className="flex flex-wrap items-end justify-between gap-2 px-1">
              <TabsList className="h-auto gap-1.5 rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="templates"
                  data-testid="nav-templates"
                  className="folio-index-tab -mb-px px-4 py-2 text-sm font-medium data-[state=active]:shadow-none"
                >
                  <Layers className="h-4 w-4 text-brass" aria-hidden="true" />
                  Structural Templates
                </TabsTrigger>
                <TabsTrigger
                  value="studio"
                  data-testid="nav-studio"
                  className="folio-index-tab -mb-px px-4 py-2 text-sm font-medium data-[state=active]:shadow-none"
                >
                  <Palette className="h-4 w-4 text-brass" aria-hidden="true" />
                  Cover &amp; Spine Styler
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="templates" className="mt-0">
              <BlueprintPreview
                geometry={geometry}
                splitMode={project.parameters.splitMode}
                pdfPageSize={project.parameters.pdfPageSize}
                unit={project.parameters.unit}
                exportingTarget={exportingTarget}
                onDownloadOuterSvg={handleDownloadOuterSvg}
                onDownloadOuterPdf={handleDownloadOuterPdf}
                onDownloadInnerSvg={handleDownloadInnerSvg}
                onDownloadInnerPdf={handleDownloadInnerPdf}
              />
            </TabsContent>

            <TabsContent value="studio" className="mt-0">
              <Suspense
                fallback={
                  <div className="rounded-b-lg rounded-tr-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
                    Loading Cover &amp; Spine Styler…
                  </div>
                }
              >
                <CoverStyler
                  params={project.parameters}
                  geometry={geometry}
                  studio={project.studio}
                  onChange={handleStudioChange}
                  onUpdateParams={(patch) =>
                    handleParamsChange(
                      BookParametersModel.clampAndNormalize({ ...project.parameters, ...patch }),
                    )
                  }
                  onStatusMessage={setStatusMessage}
                />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

export default App;
