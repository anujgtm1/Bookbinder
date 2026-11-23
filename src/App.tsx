import { BookMarked, CheckCircle2, FolderOpen, Ruler } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { MeasureAndCutPanel } from '@/components/MeasureAndCutPanel';
import { SidebarControls } from '@/components/SidebarControls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { CoverStyler } from '@/studio/CoverStyler';
import { InnerPocketsStudio } from '@/studio/InnerPocketsStudio';
import { BookParametersModel, type BookParameters } from '@/types/bookParams';
import { BookbinderProjectModel, type BookbinderProject } from '@/types/project';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';

type WorkspaceTab = 'measure' | 'outer' | 'pockets';

export function App() {
  const [project, setProject] = useState<BookbinderProject>(() => loadProjectFromStorage());
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('outer');
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

  const isSoftcoverJacket = project.parameters.bindingStyle === 'softcover-jacket';

  const handleParamsChange = (parameters: BookParameters) => {
    if (
      parameters.bindingStyle === 'softcover-jacket' &&
      project.parameters.bindingStyle !== 'softcover-jacket' &&
      activeTab === 'pockets'
    ) {
      setActiveTab('outer');
    }
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

  const handleDownloadInnerPdf = async (includeLegend = false) => {
    setExportingTarget('inner-pdf');
    try {
      const { bytes, plan } = await generateInnerTemplatesPdf(
        geometry,
        project.parameters.pdfPageSize,
        { includeLegend },
      );
      triggerBytesDownload(bytes, 'inner_pockets_and_liner.pdf', 'application/pdf');
      setStatusMessage(
        `Exported inner_pockets_and_liner.pdf (${plan.pageCount} ${plan.pageCount === 1 ? 'page' : 'pages'}${includeLegend ? ' with legend' : ''})`,
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
          {/* 3-Tab Hybrid Folio Workbench: Measure & Cut, Cover Studio, Inner Pockets */}
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as WorkspaceTab)}
            className="flex flex-col"
          >
            <div className="flex flex-wrap items-end justify-between gap-2 px-1">
              <TabsList className="h-auto gap-1.5 rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="measure"
                  data-testid="nav-measure"
                  className="folio-index-tab -mb-px px-4 py-2 text-sm font-medium data-[state=active]:shadow-none"
                >
                  <Ruler className="h-4 w-4 text-brass" aria-hidden="true" />
                  Measure &amp; Cut
                </TabsTrigger>
                <TabsTrigger
                  value="outer"
                  data-testid="nav-outer"
                  className="folio-index-tab -mb-px px-4 py-2 text-sm font-medium data-[state=active]:shadow-none"
                >
                  <BookMarked className="h-4 w-4 text-brass" aria-hidden="true" />
                  Cover Studio
                </TabsTrigger>
                <TabsTrigger
                  value="pockets"
                  data-testid="nav-pockets"
                  className="folio-index-tab -mb-px px-4 py-2 text-sm font-medium data-[state=active]:shadow-none"
                >
                  <FolderOpen
                    className={`h-4 w-4 text-brass ${isSoftcoverJacket ? 'opacity-60' : ''}`}
                    aria-hidden="true"
                  />
                  <span className={isSoftcoverJacket ? 'opacity-65' : undefined}>Inner Pockets</span>
                  {isSoftcoverJacket && (
                    <Badge
                      variant="outline"
                      data-testid="pockets-builtin-badge"
                      className="ml-0.5 h-4 px-1.5 font-mono text-[10px]"
                    >
                      Built-In
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="measure" className="mt-0">
              <MeasureAndCutPanel
                geometry={geometry}
                splitMode={project.parameters.splitMode}
                unit={project.parameters.unit}
                exportingOuterPdf={exportingTarget === 'outer-pdf'}
                onDownloadOuterSvg={handleDownloadOuterSvg}
                onDownloadOuterPdf={handleDownloadOuterPdf}
              />
            </TabsContent>

            <TabsContent value="outer" className="mt-0">
              <CoverStyler
                params={project.parameters}
                geometry={geometry}
                studio={project.studio}
                exportingOuterPdf={exportingTarget === 'outer-pdf'}
                onChange={handleStudioChange}
                onUpdateParams={(patch) =>
                  handleParamsChange(
                    BookParametersModel.clampAndNormalize({ ...project.parameters, ...patch }),
                  )
                }
                onDownloadOuterSvg={handleDownloadOuterSvg}
                onDownloadOuterPdf={handleDownloadOuterPdf}
                onOpenMeasureAndCut={() => setActiveTab('measure')}
                onStatusMessage={setStatusMessage}
              />
            </TabsContent>

            <TabsContent value="pockets" className="mt-0">
              {isSoftcoverJacket ? (
                <section
                  aria-label="Built-In Inner Pockets Notice"
                  data-testid="pockets-not-needed-notice"
                  className="rounded-b-lg rounded-tr-lg border border-border bg-card p-6 shadow-xs sm:p-8"
                >
                  <div className="mx-auto flex max-w-xl flex-col items-center text-center">
                    <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-700/30 bg-emerald-600/12 text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <Badge variant="outline" className="mb-2 font-mono text-[10px] uppercase">
                      Built-In Slip-In Pockets
                    </Badge>
                    <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
                      Inner Pockets Are Already Included
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Separate Inner Pockets &amp; Spine Liner are not needed for the 1-Piece
                      Fold-and-Glue Slip Cover — your slip-in pockets and 4 wrap-over glue tabs are
                      already built into the Cover Studio sheet.
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        data-testid="pockets-return-studio-btn"
                        onClick={() => setActiveTab('outer')}
                      >
                        <BookMarked className="h-4 w-4" aria-hidden="true" />
                        Return to Cover Studio
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="pockets-switch-flexible-btn"
                        onClick={() =>
                          handleParamsChange(
                            BookParametersModel.clampAndNormalize({
                              ...project.parameters,
                              bindingStyle: 'flexible-spine',
                            }),
                          )
                        }
                      >
                        Switch to Flexible Spine
                      </Button>
                    </div>
                  </div>
                </section>
              ) : (
                <InnerPocketsStudio
                  geometry={geometry}
                  pocketStyle={project.studio.pocketStyle}
                  coverMatchColor={project.studio.spineBgColor}
                  pdfPageSize={project.parameters.pdfPageSize}
                  unit={project.parameters.unit}
                  exportingInnerPdf={exportingTarget === 'inner-pdf'}
                  onChangePocketStyle={(pocketStyle) =>
                    handleStudioChange({ ...project.studio, pocketStyle })
                  }
                  onDownloadInnerSvg={handleDownloadInnerSvg}
                  onDownloadInnerPdf={handleDownloadInnerPdf}
                  onStatusMessage={setStatusMessage}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

export default App;
