/*
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as JsYaml from 'js-yaml';
import * as React from 'react';
import * as StaticGraphParser from '../lib/StaticGraphParser';
import Button from '@material-ui/core/Button';
import Buttons, { ButtonKeys } from '../lib/Buttons';
import Graph from '../components/Graph';
import InfoIcon from '@material-ui/icons/InfoOutlined';
import MD2Tabs from '../atoms/MD2Tabs';
import Paper from '@material-ui/core/Paper';
import RunUtils from '../lib/RunUtils';
import SidePanel from '../components/SidePanel';
import StaticNodeDetails from '../components/StaticNodeDetails';
import { ApiExperiment } from '../apis/experiment';
import { ApiPipeline, ApiGetTemplateResponse, ApiPipelineVersion } from '../apis/pipeline';
import { Apis } from '../lib/Apis';
import { Page } from './Page';
import { RoutePage, RouteParams, QUERY_PARAMS } from '../components/Router';
import { ToolbarProps } from '../components/Toolbar';
import { URLParser } from '../lib/URLParser';
import { Workflow } from '../../third_party/argo-ui/argo_template';
import { classes, stylesheet } from 'typestyle';
import Editor from '../components/Editor';
import { color, commonCss, padding, fontsize, fonts, zIndex } from '../Css';
import { logger, formatDateString } from '../lib/Utils';
import 'brace';
import 'brace/ext/language_tools';
import 'brace/mode/yaml';
import 'brace/theme/github';
import { Description } from '../components/Description';
import Select from '@material-ui/core/Select';
import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import axios from 'axios';

interface PipelineDetailsState {
  graph: dagre.graphlib.Graph | null;
  pipeline: ApiPipeline | null;
  selectedNodeId: string;
  selectedNodeInfo: JSX.Element | null;
  selectedTab: number;
  selectedVersion?: ApiPipelineVersion;
  summaryShown: boolean;
  template?: Workflow;
  templateString?: string;
  versions: ApiPipelineVersion[];
}

const summaryCardWidth = 500;

export const css = stylesheet({
  containerCss: {
    $nest: {
      '& .CodeMirror': {
        height: '100%',
        width: '80%',
      },

      '& .CodeMirror-gutters': {
        backgroundColor: '#f7f7f7',
      },
    },
    background: '#f7f7f7',
    height: '100%',
  },
  footer: {
    background: color.graphBg,
    display: 'flex',
    padding: '0 0 20px 20px',
  },
  footerInfoOffset: {
    marginLeft: summaryCardWidth + 40,
  },
  infoSpan: {
    color: color.lowContrast,
    fontFamily: fonts.secondary,
    fontSize: fontsize.small,
    letterSpacing: '0.21px',
    lineHeight: '24px',
    paddingLeft: 6,
  },
  summaryCard: {
    bottom: 20,
    left: 20,
    padding: 10,
    position: 'absolute',
    width: summaryCardWidth,
    zIndex: zIndex.PIPELINE_SUMMARY_CARD,
  },
  summaryKey: {
    color: color.strong,
    marginTop: 10,
  },
});

class PipelineDetails extends Page<{}, PipelineDetailsState> {
  constructor(props: any) {
    super(props);

    this.state = {
      graph: null,
      pipeline: null,
      selectedNodeId: '',
      selectedNodeInfo: null,
      selectedTab: 0,
      summaryShown: true,
      versions: [],
    };
  }

  public getInitialToolbarState(): ToolbarProps {
    const buttons = new Buttons(this.props, this.refresh.bind(this));
    const fromRunId = new URLParser(this.props).get(QUERY_PARAMS.fromRunId);
    const pipelineIdFromParams = this.props.match.params[RouteParams.pipelineId];
    const pipelineVersionIdFromParams = this.props.match.params[RouteParams.pipelineVersionId];
    buttons
      .newRunFromPipelineVersion(
        () => {
          return pipelineIdFromParams ? pipelineIdFromParams : '';
        },
        () => {
          return pipelineVersionIdFromParams ? pipelineVersionIdFromParams : '';
        },
      )
      .newPipelineVersion('Upload version', () =>
        pipelineIdFromParams ? pipelineIdFromParams : '',
      );

    if (fromRunId) {
      return {
        actions: buttons.getToolbarActionMap(),
        breadcrumbs: [
          {
            displayName: fromRunId,
            href: RoutePage.RUN_DETAILS.replace(':' + RouteParams.runId, fromRunId),
          },
        ],
        pageTitle: 'Pipeline details',
      };
    } else {
      // Add buttons for creating experiment and deleting pipeline version
      buttons
        .newExperiment(() =>
          this.state.pipeline
            ? this.state.pipeline.id!
            : pipelineIdFromParams
            ? pipelineIdFromParams
            : '',
        )
        .delete(
          () => (pipelineVersionIdFromParams ? [pipelineVersionIdFromParams] : []),
          'pipeline version',
          this._deleteCallback.bind(this),
          true /* useCurrentResource */,
        );
      return {
        actions: buttons.getToolbarActionMap(),
        breadcrumbs: [{ displayName: 'Pipelines', href: RoutePage.PIPELINES }],
        pageTitle: this.props.match.params[RouteParams.pipelineId],
      };
    }
  }

  public render(): JSX.Element {
    const {
      pipeline,
      selectedNodeId,
      selectedTab,
      selectedVersion,
      summaryShown,
      templateString,
      versions,
    } = this.state;

    let selectedNodeInfo: StaticGraphParser.SelectedNodeInfo | null = null;
    if (this.state.graph && this.state.graph.node(selectedNodeId)) {
      selectedNodeInfo = this.state.graph.node(selectedNodeId).info;
      if (!!selectedNodeId && !selectedNodeInfo) {
        logger.error(`Node with ID: ${selectedNodeId} was not found in the graph`);
      }
    }

    return (
      <div className={classes(commonCss.page, padding(20, 't'))}>
        <div className={commonCss.page}>
          <MD2Tabs
            selectedTab={selectedTab}
            onSwitch={(tab: number) => this.setStateSafe({ selectedTab: tab })}
            tabs={['Graph', 'YAML']}
          />
          <div className={commonCss.page}>
            {selectedTab === 0 && (
              <div className={commonCss.page}>
                {this.state.graph && (
                  <div
                    className={commonCss.page}
                    style={{ position: 'relative', overflow: 'hidden' }}
                  >
                    {!!pipeline && summaryShown && (
                      <Paper className={css.summaryCard}>
                        <div
                          style={{
                            alignItems: 'baseline',
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div className={commonCss.header}>Summary</div>
                          <Button
                            onClick={() => this.setStateSafe({ summaryShown: false })}
                            color='secondary'
                          >
                            Hide
                          </Button>
                        </div>
                        <div className={css.summaryKey}>ID</div>
                        <div>{pipeline.id || 'Unable to obtain Pipeline ID'}</div>
                        {versions.length && (
                          <React.Fragment>
                            <form autoComplete='off'>
                              <FormControl>
                                <InputLabel>Version</InputLabel>
                                <Select
                                  value={
                                    selectedVersion
                                      ? selectedVersion.id
                                      : pipeline.default_version!.id!
                                  }
                                  onChange={event => this.handleVersionSelected(event.target.value)}
                                  inputProps={{ id: 'version-selector', name: 'selectedVersion' }}
                                >
                                  {versions.map((v, _) => (
                                    <MenuItem key={v.id} value={v.id}>
                                      {v.name}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </form>
                            <div className={css.summaryKey}>
                              <a
                                href={this._createVersionUrl()}
                                target='_blank'
                                rel='noopener noreferrer'
                              >
                                Version source
                              </a>
                            </div>
                          </React.Fragment>
                        )}
                        <div className={css.summaryKey}>Uploaded on</div>
                        <div>{formatDateString(pipeline.created_at)}</div>
                        <div className={css.summaryKey}>Description</div>
                        <Description description={pipeline.description || ''} />
                      </Paper>
                    )}

                    <Graph
                      graph={this.state.graph}
                      selectedNodeId={selectedNodeId}
                      onClick={id => this.setStateSafe({ selectedNodeId: id })}
                      onError={(message, additionalInfo) =>
                        this.props.updateBanner({ message, additionalInfo, mode: 'error' })
                      }
                    />

                    <SidePanel
                      isOpen={!!selectedNodeId}
                      title={selectedNodeId}
                      onClose={() => this.setStateSafe({ selectedNodeId: '' })}
                    >
                      <div className={commonCss.page}>
                        {!selectedNodeInfo && (
                          <div className={commonCss.absoluteCenter}>
                            Unable to retrieve node info
                          </div>
                        )}
                        {!!selectedNodeInfo && (
                          <div className={padding(20, 'lr')}>
                            <StaticNodeDetails nodeInfo={selectedNodeInfo} />
                          </div>
                        )}
                      </div>
                    </SidePanel>
                    <div className={css.footer}>
                      {!summaryShown && (
                        <Button
                          onClick={() => this.setStateSafe({ summaryShown: !summaryShown })}
                          color='secondary'
                        >
                          Show summary
                        </Button>
                      )}
                      <div
                        className={classes(
                          commonCss.flex,
                          summaryShown && !!pipeline && css.footerInfoOffset,
                        )}
                      >
                        <InfoIcon className={commonCss.infoIcon} />
                        <span className={css.infoSpan}>Static pipeline graph</span>
                      </div>
                    </div>
                  </div>
                )}
                {!this.state.graph && <span style={{ margin: '40px auto' }}>No graph to show</span>}
              </div>
            )}
            {selectedTab === 1 && !!templateString && (
              <div className={css.containerCss}>
                <Editor
                  value={templateString || ''}
                  height='100%'
                  width='100%'
                  mode='yaml'
                  theme='github'
                  editorProps={{ $blockScrolling: true }}
                  readOnly={true}
                  highlightActiveLine={true}
                  showGutter={true}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  public async handleVersionSelected(versionId: string): Promise<void> {
    if (this.state.pipeline) {
      const selectedVersion = (this.state.versions || []).find(v => v.id === versionId);
      const selectedVersionPipelineTemplate = await this._getTemplateString(
        this.state.pipeline.id!,
        versionId,
      );
      this.props.history.replace({
        pathname: `/pipelines/details/${this.state.pipeline.id}/version/${versionId}`,
      });
      this.setStateSafe({
        graph: await this._createGraph(selectedVersionPipelineTemplate),
        selectedVersion,
        templateString: selectedVersionPipelineTemplate,
      });
    }
  }

  public async refresh(): Promise<void> {
    return this.load();
  }

  public async componentDidMount(): Promise<void> {
    return this.load();
  }

  public async load(): Promise<void> {
    this.clearBanner();
    const pipelineIdFromParams = this.props.match.params[RouteParams.pipelineId];
    const apiUrl = 'http://127.0.0.1:5000/pipeline_details?pipeline=' + pipelineIdFromParams;
    console.log("from run id");
    console.log(pipelineIdFromParams);

    let pipeline: ApiPipeline | null = null;
    let version: ApiPipelineVersion | null = null;
    let templateString = '';
    let breadcrumbs: Array<{ displayName: string; href: string }> = [];
    const toolbarActions = this.props.toolbarProps.actions;
    let pageTitle = pipelineIdFromParams;
    let selectedVersion: ApiPipelineVersion | undefined;
    let versions: ApiPipelineVersion[] = [];

    breadcrumbs = [{ displayName: 'Pipelines', href: RoutePage.PIPELINES }];
    templateString = '# Copyright 2020 kubeflow.org\n#\n# Licensed under the Apache License, Version 2.0 (the "License");\n# you may not use this file except in compliance with the License.\n# You may obtain a copy of the License at\n#\n#      http://www.apache.org/licenses/LICENSE-2.0\n#\n# Unless required by applicable law or agreed to in writing, software\n# distributed under the License is distributed on an "AS IS" BASIS,\n# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n# See the License for the specific language governing permissions and\n# limitations under the License.\napiVersion: tekton.dev/v1alpha1\nkind: Condition\nmetadata:\n  name: condition-1\nspec:\n  check:\n    args:\n    - "EXITCODE=$(python -c \'import sys\ninput1=str.rstrip(sys.argv[1])\ninput2=str.rstrip(sys.argv[2])\n\\n      try:\n  input1=int(input1)\n  input2=int(input2)\nexcept:\n  input1=str(input1)\n\\n      print(0) if (input1 == input2) else print(1)\' \'$(params.flip)\' \'heads\'); exit\\n      \ $EXITCODE"\n    command:\n    - sh\n    - -c\n    image: python:alpine3.6\n  params:\n  - name: flip\n---\napiVersion: tekton.dev/v1alpha1\nkind: Condition\nmetadata:\n  name: condition-2\nspec:\n  check:\n    args:\n    - "EXITCODE=$(python -c \'import sys\ninput1=str.rstrip(sys.argv[1])\ninput2=str.rstrip(sys.argv[2])\n\\n      try:\n  input1=int(input1)\n  input2=int(input2)\nexcept:\n  input1=str(input1)\n\\n      print(0) if (input1 == input2) else print(1)\' \'$(params.flip-again)\' \'tails\');\\n      \ exit $EXITCODE"\n    command:\n    - sh\n    - -c\n    image: python:alpine3.6\n  params:\n  - name: flip-again\n---\napiVersion: tekton.dev/v1alpha1\nkind: Condition\nmetadata:\n  name: condition-3\nspec:\n  check:\n    args:\n    - "EXITCODE=$(python -c \'import sys\ninput1=str.rstrip(sys.argv[1])\ninput2=str.rstrip(sys.argv[2])\n\\n      try:\n  input1=int(input1)\n  input2=int(input2)\nexcept:\n  input1=str(input1)\n\\n      print(0) if (input1 == input2) else print(1)\' \'$(params.flip)\' \'tails\'); exit\\n      \ $EXITCODE"\n    command:\n    - sh\n    - -c\n    image: python:alpine3.6\n  params:\n  - name: flip\n---\napiVersion: tekton.dev/v1beta1\nkind: Task\nmetadata:\n  name: flip\nspec:\n  results:\n  - description: /tmp/output\n    name: output\n  steps:\n  - args:\n    - python -c "import random; result = \'heads\' if random.randint(0,1) == 0 else\n      \'tails\'; print(result)" | tee $(results.output.path)\n    command:\n    - sh\n    - -c\n    image: python:alpine3.6\n    name: flip\n---\napiVersion: tekton.dev/v1beta1\nkind: Task\nmetadata:\n  name: flip-again\nspec:\n  results:\n  - description: /tmp/output\n    name: output\n  steps:\n  - args:\n    - python -c "import random; result = \'heads\' if random.randint(0,1) == 0 else\n      \'tails\'; print(result)" | tee $(results.output.path)\n    command:\n    - sh\n    - -c\n    image: python:alpine3.6\n    name: flip-again\n---\napiVersion: tekton.dev/v1beta1\nkind: Task\nmetadata:\n  name: print1\nspec:\n  params:\n  - name: flip-again-output\n  steps:\n  - command:\n    - echo\n    - $(inputs.params.flip-again-output)\n    image: alpine:3.6\n    name: print1\n---\napiVersion: tekton.dev/v1beta1\nkind: Task\nmetadata:\n  name: print2\nspec:\n  params:\n  - name: flip-again-output\n  steps:\n  - command:\n    - echo\n    - $(inputs.params.flip-again-output)\n    image: alpine:3.6\n    name: print2\n---\napiVersion: tekton.dev/v1beta1\nkind: Pipeline\nmetadata:\n  annotations:\n    pipelines.kubeflow.org/pipeline_spec: \'{"description": "Shows how to use dsl.Condition.",\n      "name": "Flip Coin Example Pipeline"}\'\n    sidecar.istio.io/inject: \'false\'\n  name: flip-coin-example-pipeline\nspec:\n  params: []\n  tasks:\n  - name: flip\n    params: []\n    taskRef:\n      name: flip\n  - conditions:\n    - conditionRef: condition-1\n      params:\n      - name: flip\n        value: $(tasks.flip.results.output)\n    name: flip-again\n    params: []\n    taskRef:\n      name: flip-again\n  - conditions:\n    - conditionRef: condition-2\n      params:\n      - name: flip-again\n        value: $(tasks.flip-again.results.output)\n    - conditionRef: condition-1\n      params:\n      - name: flip\n        value: $(tasks.flip.results.output)\n    name: print1\n    params:\n    - name: flip-again-output\n      value: $(tasks.flip-again.results.output)\n    taskRef:\n      name: print1\n  - conditions:\n    - conditionRef: condition-3\n      params:\n      - name: flip\n        value: $(tasks.flip.results.output)\n    name: print2\n    params:\n    - name: flip-again-output\n      value: $(tasks.flip-again.results.output)\n    taskRef:\n      name: print2'
    // condition: '# Copyright 2020 kubeflow.org\n#\n# Licensed under the Apache License, Version 2.0 (the "License");\n# you may not use this file except in compliance with the License.\n# You may obtain a copy of the License at\n#\n#      http://www.apache.org/licenses/LICENSE-2.0\n#\n# Unless required by applicable law or agreed to in writing, software\n# distributed under the License is distributed on an "AS IS" BASIS,\n# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n# See the License for the specific language governing permissions and\n# limitations under the License.\napiVersion: tekton.dev/v1alpha1\nkind: Condition\nmetadata:\n  name: condition-1\nspec:\n  check:\n    args:\n    - "EXITCODE=$(python -c \'import sys\ninput1=str.rstrip(sys.argv[1])\ninput2=str.rstrip(sys.argv[2])\n\\n      try:\n  input1=int(input1)\n  input2=int(input2)\nexcept:\n  input1=str(input1)\n\\n      print(0) if (input1 == input2) else print(1)\' \'$(params.flip)\' \'heads\'); exit\\n      \ $EXITCODE"\n    command:\n    - sh\n    - -c\n    image: python:alpine3.6\n  params:\n  - name: flip\n---\napiVersion: tekton.dev/v1alpha1\nkind: Condition\nmetadata:\n  name: condition-2\nspec:\n  check:\n    args:\n    - "EXITCODE=$(python -c \'import sys\ninput1=str.rstrip(sys.argv[1])\ninput2=str.rstrip(sys.argv[2])\n\\n      try:\n  input1=int(input1)\n  input2=int(input2)\nexcept:\n  input1=str(input1)\n\\n      print(0) if (input1 == input2) else print(1)\' \'$(params.flip-again)\' \'tails\');\\n      \ exit $EXITCODE"\n    command:\n    - sh\n    - -c\n    image: python:alpine3.6\n  params:\n  - name: flip-again\n---\napiVersion: tekton.dev/v1alpha1\nkind: Condition\nmetadata:\n  name: condition-3\nspec:\n  check:\n    args:\n    - "EXITCODE=$(python -c \'import sys\ninput1=str.rstrip(sys.argv[1])\ninput2=str.rstrip(sys.argv[2])\n\\n      try:\n  input1=int(input1)\n  input2=int(input2)\nexcept:\n  input1=str(input1)\n\\n      print(0) if (input1 == input2) else print(1)\' \'$(params.flip)\' \'tails\'); exit\\n      \ $EXITCODE"\n    command:\n    - sh\n    - -c\n    image: python:alpine3.6\n  params:\n  - name: flip\n---\napiVersion: tekton.dev/v1beta1\nkind: Task\nmetadata:\n  name: flip\nspec:\n  results:\n  - description: /tmp/output\n    name: output\n  steps:\n  - args:\n    - python -c "import random; result = \'heads\' if random.randint(0,1) == 0 else\n      \'tails\'; print(result)" | tee $(results.output.path)\n    command:\n    - sh\n    - -c\n    image: python:alpine3.6\n    name: flip\n---\napiVersion: tekton.dev/v1beta1\nkind: Task\nmetadata:\n  name: flip-again\nspec:\n  results:\n  - description: /tmp/output\n    name: output\n  steps:\n  - args:\n    - python -c "import random; result = \'heads\' if random.randint(0,1) == 0 else\n      \'tails\'; print(result)" | tee $(results.output.path)\n    command:\n    - sh\n    - -c\n    image: python:alpine3.6\n    name: flip-again\n---\napiVersion: tekton.dev/v1beta1\nkind: Task\nmetadata:\n  name: print1\nspec:\n  params:\n  - name: flip-again-output\n  steps:\n  - command:\n    - echo\n    - $(inputs.params.flip-again-output)\n    image: alpine:3.6\n    name: print1\n---\napiVersion: tekton.dev/v1beta1\nkind: Task\nmetadata:\n  name: print2\nspec:\n  params:\n  - name: flip-again-output\n  steps:\n  - command:\n    - echo\n    - $(inputs.params.flip-again-output)\n    image: alpine:3.6\n    name: print2\n---\napiVersion: tekton.dev/v1beta1\nkind: Pipeline\nmetadata:\n  annotations:\n    pipelines.kubeflow.org/pipeline_spec: \'{"description": "Shows how to use dsl.Condition.",\n      "name": "Flip Coin Example Pipeline"}\'\n    sidecar.istio.io/inject: \'false\'\n  name: flip-coin-example-pipeline\nspec:\n  params: []\n  tasks:\n  - name: flip\n    params: []\n    taskRef:\n      name: flip\n  - conditions:\n    - conditionRef: condition-1\n      params:\n      - name: flip\n        value: $(tasks.flip.results.output)\n    name: flip-again\n    params: []\n    taskRef:\n      name: flip-again\n  - conditions:\n    - conditionRef: condition-2\n      params:\n      - name: flip-again\n        value: $(tasks.flip-again.results.output)\n    - conditionRef: condition-1\n      params:\n      - name: flip\n        value: $(tasks.flip.results.output)\n    name: print1\n    params:\n    - name: flip-again-output\n      value: $(tasks.flip-again.results.output)\n    taskRef:\n      name: print1\n  - conditions:\n    - conditionRef: condition-3\n      params:\n      - name: flip\n        value: $(tasks.flip.results.output)\n    name: print2\n    params:\n    - name: flip-again-output\n      value: $(tasks.flip-again.results.output)\n    taskRef:\n      name: print2'
    // sequential: '# Copyright 2020 kubeflow.org\n#\n# Licensed under the Apache License, Version 2.0 (the "License");\n# you may not use this file except in compliance with the License.\n# You may obtain a copy of the License at\n#\n#      http://www.apache.org/licenses/LICENSE-2.0\n#\n# Unless required by applicable law or agreed to in writing, software\n# distributed under the License is distributed on an "AS IS" BASIS,\n# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n# See the License for the specific language governing permissions and\n# limitations under the License.\n\napiVersion: tekton.dev/v1beta1\nkind: Task\nmetadata:\n  name: gcs-download\nspec:\n  params:\n  - name: url\n  steps:\n  - args:\n    - gsutil cat $0 | tee $1\n    - $(inputs.params.url)\n    - /tmp/results.txt\n    command:\n    - sh\n    - -c\n    image: google/cloud-sdk:216.0.0\n    name: gcs-download\n---\napiVersion: tekton.dev/v1beta1\nkind: Task\nmetadata:\n  name: echo\nspec:\n  params:\n  - name: path\n  steps:\n  - args:\n    - echo "$0"\n    - $(inputs.params.path)\n    command:\n    - sh\n    - -c\n    image: library/bash:4.4.23\n    name: echo\n---\napiVersion: tekton.dev/v1beta1\nkind: Pipeline\nmetadata:\n  annotations:\n    pipelines.kubeflow.org/pipeline_spec: \'{"description": "A pipeline with two sequential\n      steps.", "inputs": [{"default": "gs://ml-pipeline-playground/shakespeare1.txt",\n      "name": "url", "optional": true}, {"default": "/tmp/results.txt", "name": "path",\n      "optional": true}], "name": "Sequential pipeline"}\'\n    sidecar.istio.io/inject: \'false\'\n  name: sequential-pipeline\nspec:\n  params:\n  - default: gs://ml-pipeline-playground/shakespeare1.txt\n    name: url\n  - default: /tmp/results.txt\n    name: path\n  tasks:\n  - name: gcs-download\n    params:\n    - name: url\n      value: $(params.url)\n    taskRef:\n      name: gcs-download\n  - name: echo\n    params:\n    - name: path\n      value: $(params.path)\n    runAfter:\n    - gcs-download\n    taskRef:\n      name: echo'
    
    await axios({
      method: "get",
      url: apiUrl,
    }).then(function(res) {
      console.log("Created new run");
      templateString = res.data.status
    }).catch(function(error) {
      console.log("Create new run failed");
      console.log(error)
    })

    this.props.updateToolbar({ breadcrumbs, actions: toolbarActions, pageTitle });

    this.setStateSafe({
      graph: await this._createGraph(templateString),
      pipeline,
      selectedVersion,
      templateString,
      versions,
    });
  }

  private async _getTemplateString(pipelineId: string, versionId: string): Promise<string> {
    try {
      let templateResponse: ApiGetTemplateResponse;
      if (versionId) {
        templateResponse = await Apis.pipelineServiceApi.getPipelineVersionTemplate(versionId);
      } else {
        templateResponse = await Apis.pipelineServiceApi.getTemplate(pipelineId);
      }
      return templateResponse.template || '';
    } catch (err) {
      await this.showPageError('Cannot retrieve pipeline template.', err);
      logger.error('Cannot retrieve pipeline details.', err);
    }
    return '';
  }

  private async _createGraph(templateString: string): Promise<dagre.graphlib.Graph | null> {
    if (templateString) {
      try {
        const template = JsYaml.safeLoadAll(templateString);
        const toReturn = StaticGraphParser.createGraph(template!);
        return toReturn;
      } catch (err) {
        await this.showPageError('Error: failed to generate Pipeline graph.', err);
      }
    }
    return null;
  }

  private _createVersionUrl(): string {
    return this.state.selectedVersion!.code_source_url!;
  }

  private _deleteCallback(_: string[], success: boolean): void {
    if (success) {
      const breadcrumbs = this.props.toolbarProps.breadcrumbs;
      const previousPage = breadcrumbs.length
        ? breadcrumbs[breadcrumbs.length - 1].href
        : RoutePage.PIPELINES;
      this.props.history.push(previousPage);
    }
  }
}

export default PipelineDetails;
