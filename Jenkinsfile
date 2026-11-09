pipeline {
    agent any

    // PIPELINE TỔNG của repo DAFL-Source (linh1912/DAFL-Source) — đợt 14.
    // Phân công CI/CD (đừng nhầm với Jenkinsfile của repo test):
    //  - Repo test linh1912/DAFL_DO_AN_TOT_NGHIEP đã có sẵn 3 Jenkinsfile
    //    riêng (Jenkinsfile, Jenkinsfile.auto, Jenkinsfile.pt) để chạy test
    //    độc lập — file này KHÔNG viết lại và KHÔNG sửa chúng.
    //  - File này chỉ làm pipeline tổng: checkout source ở đây + clone repo
    //    test (nhánh main) vào build-worktree/dafl-tests + build source và
    //    Gateway + chạy suite test TỪ repo test (không copy test sang repo
    //    Source, không tách JMeter ra repo riêng) + Quality Gate + deploy.
    //  - Suite Selenium: dafl-tests/automation/testng-web.xml (web :3000),
    //    dafl-tests/automation/testng-admin.xml (admin :3001).
    //  - JMeter: dafl-tests/performance/dafl-loadtest.jmx, script kiểm tra
    //    Quality Gate hiệu năng: dafl-tests/quality-gate/check_performance_gate.sh.

    options {
        // Chống 2 build chạy song song đụng container
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    triggers {
        githubPush()
    }

    environment {
        REPO_URL        = 'https://github.com/linh1912/DAFL-Source.git'
        TEST_REPO_URL   = 'https://github.com/linh1912/DAFL_DO_AN_TOT_NGHIEP.git'
        TARGET_BRANCH   = 'main'
        WORKTREE_DIR    = 'build-worktree'
        PROJECT_NAME    = 'dafl'
        DOCKER_NETWORK  = 'dafl_dafl-network'

        // Ngưỡng Quality Gate hiệu năng (Stage 5)
        MAX_ERROR_RATE  = '2.0'      // Tỷ lệ lỗi tối đa: 2%
        MAX_AVG_RT_MS   = '1000.0'   // Response Time trung bình tối đa: 1000ms
    }

    stages {
        stage('Stage 1: Checkout') {
            steps {
                echo "=== Stage 1: Lấy mã nguồn mới nhất từ GitHub (${TARGET_BRANCH}) ==="
                git branch: TARGET_BRANCH, url: REPO_URL

                echo "=== Khởi tạo Git Worktree tách biệt để Build & Test ==="
                sh """
                    git worktree remove --force ${WORKTREE_DIR} 2>/dev/null || true
                    rm -rf ${WORKTREE_DIR} || true
                    git worktree prune || true

                    git fetch origin ${TARGET_BRANCH}
                    git worktree add --force --detach ${WORKTREE_DIR} origin/${TARGET_BRANCH}

                    # Nạp file .env chứa PayOS API Keys thật từ máy chủ vào worktree
                    if [ -f /var/repo/DAFL/.env ]; then
                        cp /var/repo/DAFL/.env ${WORKTREE_DIR}/.env
                        echo "✅ Đã nạp file .env từ /var/repo/DAFL vào ${WORKTREE_DIR}"
                    elif [ -f .env ]; then
                        cp .env ${WORKTREE_DIR}/.env
                        echo "✅ Đã nạp file .env từ workspace vào ${WORKTREE_DIR}"
                    fi

                    echo "Danh sách worktrees hiện tại:"
                    git worktree list

                    # Lay repo test rieng (suite web/admin tach rieng o do) vao worktree
                    rm -rf ${WORKTREE_DIR}/dafl-tests || true
                    git clone --depth 1 -b main ${TEST_REPO_URL} ${WORKTREE_DIR}/dafl-tests
                """
            }
        }

        stage('Build & Prepare Test Environment') {
            steps {
                echo "=== Build và khởi chạy SUT (System Under Test) trên Docker ==="
                dir(env.WORKTREE_DIR) {
                    sh """
                        # Build container backend, gateway và 2 app frontend (shop + admin) phiên bản mới nhất
                        docker compose -p ${PROJECT_NAME} -f docker-compose.yml build backend frontend admin gateway

                        # Chạy toàn bộ services (Postgres, Kafka, Backend, Frontend)
                        docker compose -p ${PROJECT_NAME} -f docker-compose.yml up -d

                        # Chờ Backend sẵn sàng (tối đa 120 giây) thay vì sleep cố định.
                        # Gọi /health từ bên trong container frontend (nginx alpine có sẵn wget, cùng network với backend).
                        echo "Chờ Backend phản hồi /health..."
                        ready=0
                        for i in \$(seq 1 60); do
                            if docker exec dafl-frontend wget -q -O /dev/null http://backend:8080/health 2>/dev/null; then
                                ready=1
                                echo "✅ Backend sẵn sàng sau khoảng \$((i * 2)) giây"
                                break
                            fi
                            sleep 2
                        done
                        if [ \$ready -ne 1 ]; then
                            echo "❌ Backend không phản hồi /health sau 120 giây"
                            docker compose -p ${PROJECT_NAME} -f docker-compose.yml logs --tail=50 backend || true
                            exit 1
                        fi
                    """
                }
            }
        }

        // Gateway Smoke Test (đợt 14): kiểm tra gateway vừa build xong —
        // /gateway/health do gateway tự trả, /health và trang shop qua
        // gateway (proxy về backend / frontend). Fail ở đây thì dừng
        // pipeline trước khi chạy Selenium (đỡ tốn thời gian chạy test
        // trên một gateway hỏng). Chạy trong container dafl-gateway
        // (image runtime đã cài curl chỉ để healthcheck).
        stage('Gateway Smoke Test') {
            steps {
                echo "=== Gateway Smoke Test: /gateway/health + /health + shop qua gateway ==="
                sh """
                    docker exec dafl-gateway curl -fsS http://localhost:8080/gateway/health
                    echo "✅ Gateway tự trả /gateway/health"
                    docker exec dafl-gateway curl -fsS http://localhost:8080/health
                    echo "✅ Backend trả /health qua gateway"
                    docker exec dafl-gateway curl -fsS -o /dev/null http://localhost:8080/
                    echo "✅ Shop trả 200 qua gateway"
                """
            }
        }

        // Tách web/admin (nối tiếp, KHÔNG song song): 2 stage chạy chung 1 workspace.
        // Suite test (testng-web.xml / testng-admin.xml) lay tu repo test rieng
        // linh1912/DAFL_DO_AN_TOT_NGHIEP (clone vao build-worktree/dafl-tests o Stage 1);
        // thu muc tests/functional-selenium cu trong repo nay khong con duoc pipeline dung.
        // nên chạy song song sẽ đụng nhau ở target/surefire-reports. Stage Web dọn
        // sạch rồi chạy testng-web.xml; stage Admin chạy NỐI TIẾP, KHÔNG `mvn clean`
        // và không xóa target/ — để target/surefire-reports giữ kết quả của CẢ 2
        // suite cho stage 'Functional Quality Gate' phía sau kiểm tra (nếu Admin
        // clean thì kết quả web bị xóa và Quality Gate chỉ còn thấy admin).
        stage('Functional Regression - Web') {
            steps {
                echo "=== Functional Regression - Web: Chạy Maven Selenium Headless, suite web (RAM Limit: 1.2GB) ==="
                dir("${env.WORKTREE_DIR}/dafl-tests/automation") {
                    sh """
                        # Dọn dẹp kết quả test cũ
                        rm -rf target/surefire-reports target/allure-results || true

                        # Chạy container Maven + Chrome Headless chia sẻ volume với dafl-jenkins
                        docker run --rm \
                            --name dafl-selenium-runner \
                            --network ${DOCKER_NETWORK} \
                            --volumes-from dafl-jenkins \
                            -w \$(pwd) \
                            --memory=1.2g \
                            --cpus=1.5 \
                            -e APP_URL="http://dafl-frontend:80" \
                            markhobson/maven-chrome:jdk-17 \
                            mvn clean test -DsuiteXmlFile=testng-web.xml || true
                    """
                }
            }
            post {
                always {
                    // 1. Luôn thu thập báo cáo Surefire để Jenkins hiển thị biểu đồ Test Result (Pass/Fail)
                    junit testResults: "${env.WORKTREE_DIR}/dafl-tests/automation/target/surefire-reports/*.xml", allowEmptyResults: true

                    // 2. Lưu trữ file XML kết quả làm Artifact
                    archiveArtifacts artifacts: "${env.WORKTREE_DIR}/dafl-tests/automation/target/surefire-reports/*.xml", allowEmptyArchive: true

                    // 3. Render Allure Test Report nếu Jenkins đã cài đặt Allure Plugin
                    script {
                        def allureDir = "${env.WORKTREE_DIR}/dafl-tests/automation/target/allure-results"
                        if (fileExists(allureDir)) {
                            try {
                                allure([
                                    includeProperties: false,
                                    jdk: '',
                                    properties: [],
                                    reportBuildPolicy: 'ALWAYS',
                                    results: [[path: allureDir]]
                                ])
                            } catch (Throwable err) {
                                echo "Allure Report warning: Chưa cấu hình Allure Commandline trong Jenkins Tools. Chi tiết: ${err}"
                            }
                        }
                    }
                }
            }
        }

        stage('Functional Regression - Admin') {
            steps {
                echo "=== Functional Regression - Admin: Chạy Maven Selenium Headless, suite admin (RAM Limit: 1.2GB) ==="
                dir("${env.WORKTREE_DIR}/dafl-tests/automation") {
                    sh """
                        # KHÔNG dọn target/ và KHÔNG `mvn clean` ở stage này: giữ lại kết
                        # quả suite web vừa chạy để Quality Gate phía sau kiểm tra cả 2.

                        # Chạy container Maven + Chrome Headless chia sẻ volume với dafl-jenkins
                        docker run --rm \
                            --name dafl-selenium-runner \
                            --network ${DOCKER_NETWORK} \
                            --volumes-from dafl-jenkins \
                            -w \$(pwd) \
                            --memory=1.2g \
                            --cpus=1.5 \
                            -e APP_URL="http://dafl-frontend:80" \
                            -e ADMIN_APP_URL="http://dafl-admin:80" \
                            markhobson/maven-chrome:jdk-17 \
                            mvn test -DsuiteXmlFile=testng-admin.xml || true
                    """
                }
            }
            post {
                always {
                    // 1. Luôn thu thập báo cáo Surefire để Jenkins hiển thị biểu đồ Test Result (Pass/Fail)
                    junit testResults: "${env.WORKTREE_DIR}/dafl-tests/automation/target/surefire-reports/*.xml", allowEmptyResults: true

                    // 2. Lưu trữ file XML kết quả làm Artifact
                    archiveArtifacts artifacts: "${env.WORKTREE_DIR}/dafl-tests/automation/target/surefire-reports/*.xml", allowEmptyArchive: true

                    // 3. Render Allure Test Report nếu Jenkins đã cài đặt Allure Plugin
                    script {
                        def allureDir = "${env.WORKTREE_DIR}/dafl-tests/automation/target/allure-results"
                        if (fileExists(allureDir)) {
                            try {
                                allure([
                                    includeProperties: false,
                                    jdk: '',
                                    properties: [],
                                    reportBuildPolicy: 'ALWAYS',
                                    results: [[path: allureDir]]
                                ])
                            } catch (Throwable err) {
                                echo "Allure Report warning: Chưa cấu hình Allure Commandline trong Jenkins Tools. Chi tiết: ${err}"
                            }
                        }
                    }
                }
            }
        }

        stage('Stage 3: Functional Quality Gate') {
            steps {
                echo "=== Stage 3: Kiểm tra kết quả Functional Tests (Abort nếu Fail) ==="
                dir("${env.WORKTREE_DIR}/dafl-tests/automation") {
                    script {
                        def reportDir = "target/surefire-reports"
                        if (!fileExists(reportDir)) {
                            error("❌ [Functional Quality Gate FAILED] Không tìm thấy thư mục báo cáo test Surefire!")
                        }

                        // Đếm số lượng test cases thất bại hoặc lỗi
                        def hasFailures = sh(
                            script: "grep -rnE 'failures=\"[1-9][0-9]*\"|errors=\"[1-9][0-9]*\"' ${reportDir}/*.xml 2>/dev/null || true",
                            returnStdout: true
                        ).trim()

                        if (hasFailures) {
                            echo "=== Chi tiết lỗi kiểm thử Functional ==="
                            echo hasFailures
                            error("❌ [Functional Quality Gate FAILED] Phát hiện Test Case thất bại! Dừng Pipeline ngay lập tức (Báo cáo đã được lưu lại).")
                        } else {
                            echo "✅ [Functional Quality Gate PASSED] Toàn bộ test case Selenium Headless đều vượt qua thành công!"
                        }
                    }
                }
            }
        }

        stage('Stage 4: Performance Test') {
            steps {
                echo "=== Stage 4: Gọi JMeter Non-GUI (RAM Limit: 768MB, Heap: 512MB) ==="
                // File .jmx lấy TỪ repo test đã clone (dafl-tests/performance/),
                // không copy sang repo Source. Đường dẫn cũ
                // tests/performance-jmeter không tồn tại trong repo test.
                dir("${env.WORKTREE_DIR}/dafl-tests/performance") {
                    sh """
                        # Chuẩn bị thư mục kết quả
                        rm -rf results && mkdir -p results

                        # Chạy JMeter CLI Non-GUI chia sẻ volume với dafl-jenkins
                        docker run --rm \
                            --name dafl-jmeter-runner \
                            --network ${DOCKER_NETWORK} \
                            --volumes-from dafl-jenkins \
                            -w \$(pwd) \
                            --memory=768m \
                            --cpus=1.0 \
                            -e JVM_XMS=256 -e JVM_XMX=512 -e JVM_XMN=128 \
                            justb4/jmeter:5.5 \
                            -n -t dafl-loadtest.jmx \
                            -Jtarget_host=dafl-backend \
                            -Jtarget_port=8080 \
                            -l results/result.jtl \
                            -e -o results/dashboard || true
                    """
                }
            }
            post {
                always {
                    // Xuất JMeter HTML Dashboard
                    publishHTML([
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: "${env.WORKTREE_DIR}/dafl-tests/performance/results/dashboard",
                        reportFiles: 'index.html',
                        reportName: 'JMeter Performance Dashboard',
                        reportTitles: 'JMeter Dashboard Report'
                    ])

                    // Lưu trữ file .jtl làm Artifacts
                    archiveArtifacts artifacts: "${env.WORKTREE_DIR}/dafl-tests/performance/results/*.jtl", allowEmptyArchive: true
                }
            }
        }

        stage('Stage 5: Performance Quality Gate') {
            steps {
                echo "=== Stage 5: Kiểm tra Response Time và Error Rate từ .jtl ==="
                // Script gate nằm ở dafl-tests/quality-gate/ trong repo test
                // (đường dẫn cũ check_performance_gate.sh tại thư mục chạy
                // không tồn tại trong repo test).
                dir("${env.WORKTREE_DIR}/dafl-tests/performance") {
                    sh """
                        chmod +x ../quality-gate/check_performance_gate.sh
                        ../quality-gate/check_performance_gate.sh results/result.jtl ${MAX_ERROR_RATE} ${MAX_AVG_RT_MS}
                    """
                }
            }
        }

        stage('Deploy Production') {
            steps {
                echo "=== Tất cả các Test & Quality Gate đã PASSED! Tiến hành cập nhật Container ==="
                dir(env.WORKTREE_DIR) {
                    sh """
                        # 1. Dừng và gỡ bỏ container backend/frontend/admin/gateway cũ
                        docker compose -p ${PROJECT_NAME} -f docker-compose.yml stop backend frontend admin gateway || true
                        docker compose -p ${PROJECT_NAME} -f docker-compose.yml rm -f backend frontend admin gateway || true

                        # 2. Khởi tạo container mới từ image vừa build và pass test
                        docker compose -p ${PROJECT_NAME} -f docker-compose.yml up -d --remove-orphans

                        # 3. Dọn dẹp layer dangling
                        docker image prune -f
                    """
                }
            }
        }

        stage('Verify Status') {
            steps {
                echo "=== Kiểm tra trạng thái các Container sau khi Deploy ==="
                sh "docker compose -p ${PROJECT_NAME} ps"
            }
        }
    }

    post {
        always {
            echo "=== Dọn dẹp Git Worktree và Test Runners ==="
            sh """
                docker rm -f dafl-selenium-runner dafl-jmeter-runner 2>/dev/null || true
                git worktree remove --force ${WORKTREE_DIR} 2>/dev/null || true
                rm -rf ${WORKTREE_DIR} || true
                git worktree prune || true
            """
        }
        success {
            echo "=========================================================="
            echo "🎉 Pipeline thành công: Functional & Performance Quality Gates PASSED!"
            echo "👉 Gateway  : http://localhost:8080"
            echo "👉 Frontend : http://localhost:3000"
            echo "👉 Admin    : http://localhost:3001"
            echo "👉 Backend  : http://localhost:5000"
            echo "=========================================================="
        }
        failure {
            echo "❌ Pipeline thất bại do không vượt qua Quality Gate hoặc lỗi Build/Deploy!"
            echo "👉 Vui lòng kiểm tra mục 'Test Result' hoặc 'Allure Report' trên Jenkins để xem chi tiết test case fail."
        }
    }
}
